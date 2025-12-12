import express from 'express';
import bodyParser from 'body-parser';
import xml2js from 'xml2js';
import sha1 from 'sha1';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs'; // [新增] 引入文件系统模块
import { sendOrder as sendToPrinter } from './services/printerAdapters/index.js';
import { createUser, getLoginUrl, getUserInfo, updateUser } from './services/printerAdapters/lt.js';
import path from 'path';
import { fileURLToPath } from 'url';

// --- 基础配置 ---
dotenv.config();
const app = express();
const PORT = 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'orders.json'); // [新增] 数据存储路径

// --- 数据持久化逻辑 [新增] ---
// 启动时读取本地数据，防止重启丢失
let orders = [];
if (fs.existsSync(DATA_FILE)) {
    try {
        orders = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        console.log(`已加载本地数据，共 ${orders.length}条订单`);
    } catch (e) {
        console.error('读取本地数据失败，将使用空数组初始化');
    }
}

// 保存数据到本地的辅助函数
const saveOrders = () => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2));
};

// --- 微信用户账户绑定数据 [新增] ---
const WECHAT_USERS_FILE = path.join(__dirname, 'wechat_users.json');
let wechatUsers = [];
if (fs.existsSync(WECHAT_USERS_FILE)) {
    try {
        wechatUsers = JSON.parse(fs.readFileSync(WECHAT_USERS_FILE, 'utf-8'));
        console.log(`已加载微信用户绑定数据，共 ${wechatUsers.length} 个用户`);
    } catch (e) {
        console.error('读取微信用户数据失败，将使用空数组初始化');
    }
}

// 保存微信用户数据到本地的辅助函数
const saveWechatUsers = () => {
    fs.writeFileSync(WECHAT_USERS_FILE, JSON.stringify(wechatUsers, null, 2));
};

// 根据 openid 查找或创建微信用户
const getOrCreateWechatUser = (openid, nickname = '') => {
    let user = wechatUsers.find(u => u.openid === openid);
    if (!user) {
        user = {
            openid,
            nickname: nickname || `user_${openid.substring(0, 8)}`,
            bindTime: new Date().toISOString(),
            ltBindings: []
        };
        wechatUsers.push(user);
        saveWechatUsers();
    }
    return user;
};
// 为微信用户绑定 LT 打单账户（支持登录名，保留原 shopName），可记录 lastSender
const bindLtAccount = (openid, shopName, userKey, loginName = null, lastSender = null) => {
    const user = getOrCreateWechatUser(openid);
    // 避免重复绑定
    const existBinding = user.ltBindings.find(b => b.shopName === shopName || (loginName && b.loginName === loginName));
    if (existBinding) {
        existBinding.userKey = userKey;
        if (loginName) existBinding.loginName = loginName;
        if (lastSender) existBinding.lastSender = lastSender;
        existBinding.bindAt = new Date().toISOString();
    } else {
        user.ltBindings.push({
            shopName,
            userKey,
            ...(loginName ? { loginName } : {}),
            ...(lastSender ? { lastSender } : {}),
            bindAt: new Date().toISOString()
        });
    }
    saveWechatUsers();
    return user;
};

// --- 微信配置 ---
const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET;

let wechatTokenCache = { token: null, expiresAt: 0 };

// 简单 https 请求封装（用于微信 API）
async function wxRequest(method, url, body = null) {
    return new Promise((resolve, reject) => {
        try {
            const parsed = new URL(url);
            const headers = {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'wechat-logistics/1.0',
                'Connection': 'close'
            };
            let bodyStr = null;
            if (body) {
                bodyStr = JSON.stringify(body);
                headers['Content-Type'] = 'application/json';
                headers['Content-Length'] = Buffer.byteLength(bodyStr);
            }

            const options = {
                method,
                protocol: parsed.protocol || 'https:',
                hostname: parsed.hostname,
                port: parsed.port || 443,
                path: parsed.pathname + (parsed.search || ''),
                headers,
                family: 4 // 优先 IPv4，避免部分环境 IPv6 导致异常
            };

            const req = https.request(options, (resp) => {
                const chunks = [];
                resp.on('data', d => chunks.push(d));
                resp.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf-8');
                    try {
                        const json = JSON.parse(text);
                        resolve(json);
                    } catch (err) {
                        const snippet = text.slice(0, 500);
                        console.error('微信 API 非 JSON 响应 headers:', resp.headers || {});
                        const msg = `微信 API 响应非 JSON (status ${resp.statusCode || ''}): ${snippet}`;
                        console.error(msg);
                        reject(new Error(msg));
                    }
                });
            });

            req.on('error', reject);
            if (bodyStr) req.write(bodyStr);
            req.end();
        } catch (err) {
            reject(err);
        }
    });
}

async function getWechatAccessToken() {
    if (!WECHAT_APPID || !WECHAT_APPSECRET) {
        throw new Error('缺少 WECHAT_APPID 或 WECHAT_APPSECRET 环境变量');
    }
    if (wechatTokenCache.token && Date.now() < wechatTokenCache.expiresAt) {
        return wechatTokenCache.token;
    }
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_APPID}&secret=${WECHAT_APPSECRET}`;
    const resp = await wxRequest('GET', url);
    if (resp.errcode) {
        throw new Error(`获取 access_token 失败: ${resp.errmsg || resp.errcode}`);
    }
    const expires = resp.expires_in ? (resp.expires_in - 120) * 1000 : 7000 * 1000; // 提前 120s 过期
    wechatTokenCache = { token: resp.access_token, expiresAt: Date.now() + expires };
    return resp.access_token;
}

// 发送客服文本消息，便于下发登录链接等提醒
async function sendWechatCustomMessage(openid, content) {
    const token = await getWechatAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`;
    const payload = {
        touser: openid,
        msgtype: 'text',
        text: { content }
    };
    const resp = await wxRequest('POST', url, payload);
    if (resp && resp.errcode && resp.errcode !== 0) {
        throw new Error(`发送客服消息失败: ${resp.errmsg || resp.errcode}`);
    }
    return resp;
}

// --- 配置阿里云百炼 ---
let client = null;
if (process.env.BAILIAN_API_KEY) {
    client = new OpenAI({
        apiKey: process.env.BAILIAN_API_KEY,
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    });
} else {
    console.warn('警告: BAILIAN_API_KEY 未设置，AI 功能将被禁用。测试/本地运行时可留空。');
}

app.use(cors());
app.use(bodyParser.text({ type: '*/xml' }));
app.use(express.json());

// 下载图片并返回 base64 编码的 data URL（尽可能兼容 http/https）
import http from 'http';
import https from 'https';

async function downloadImageAsBase64(url) {
    return new Promise((resolve, reject) => {
        try {
            const client = url.startsWith('https') ? https : http;
            client.get(url, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    const contentType = res.headers['content-type'] || 'image/jpeg';
                    const base64 = buffer.toString('base64');
                    resolve(`data:${contentType};base64,${base64}`);
                });
            }).on('error', (err) => {
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

// 1. 微信验证接口
app.get('/wechat', (req, res) => {
    console.log('收到微信验证请求:', req.query);
    const { signature, timestamp, nonce, echostr } = req.query;
    const token = process.env.WECHAT_TOKEN || 'mytesttoken'; // 从环境读取，兼容旧配置（推荐在 .env 中定义 WECHAT_TOKEN）
    const str = [token, timestamp, nonce].sort().join('');
    const sha = sha1(str);

    if (!process.env.WECHAT_TOKEN) {
        console.warn('警告: WECHAT_TOKEN 未设置，正在使用默认硬编码 token（不建议用于生产）');
    }

    if (sha === signature) {
        console.log('验证通过');
        res.send(echostr);
    } else {
        console.log('验证失败');
        res.send('验证失败');
    }
});

// 2. 接收微信消息 (已增强支持图片)
app.post('/wechat', async (req, res) => {
    try {
        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(req.body);
        const message = result.xml;
        
        // 立即回复 success 避免微信重试
        res.send('success');

        console.log(`收到消息类型: ${message.MsgType}, 来自用户: ${message.FromUserName}`);

        // 提取微信用户 openid
        const wechatUser = getOrCreateWechatUser(message.FromUserName);

        if (message.MsgType === 'text') {
            // 处理文本消息
            const content = (message.Content || '').trim();

            // 快捷指令：生成打印平台登录链接
            if (content === '打印' || content === '打单' || content.toLowerCase() === 'print') {
                try {
                    if (!wechatUser.ltBindings || wechatUser.ltBindings.length === 0) {
                        await sendWechatCustomMessage(wechatUser.openid, '❌ 您还未绑定打单账号，请先发送发件人地址完成自动创建/绑定后再试');
                        return;
                    }

                    const binding = wechatUser.ltBindings[0];
                    const loginResp = await getLoginUrl(binding.shopName, binding.userKey);
                    let loginUrl = null;
                    if (loginResp && loginResp.code === 0 && loginResp.data) {
                        loginUrl = typeof loginResp.data === 'string' ? loginResp.data : (loginResp.data.url || loginResp.data);
                    }
                    if (!loginUrl) {
                        const base = process.env.LT_LOGIN_BASE_URL || 'https://lt.800best.com/smart/h5/index.html';
                        const params = new URLSearchParams({ shopName: binding.shopName });
                        loginUrl = `${base}?${params.toString()}`;
                    }

                    const accountLabel = binding.loginName || binding.shopName;
                    const reply = `✅ 登录链接已生成\n店铺：${accountLabel}\n👉 <a href="${loginUrl}">点击此处进入打单平台</a>\n(链接有效期较短，请尽快点击)`;
                    await sendWechatCustomMessage(wechatUser.openid, reply);
                } catch (err) {
                    console.error('发送打印登录链接失败:', err);
                    await sendWechatCustomMessage(wechatUser.openid, '❌ 获取登录链接失败，请稍后再试');
                }
                return; // 不走 AI 解析
            }

            processContent(message.Content, 'text', wechatUser);
        } else if (message.MsgType === 'image') {
            // [新增] 处理图片消息
            console.log('收到图片，URL:', message.PicUrl);
            try {
                // 图片同样支持快捷“打印”入口：先回复登录链接，随后再走 AI 解析
                if (!wechatUser.ltBindings || wechatUser.ltBindings.length === 0) {
                    await sendWechatCustomMessage(wechatUser.openid, '✅ 收到图片，正在解析地址…\n提示：发送发件人地址后会自动为您创建并绑定打单账号');
                } else {
                    const binding = wechatUser.ltBindings[0];
                    const loginResp = await getLoginUrl(binding.shopName, binding.userKey);
                    let loginUrl = null;
                    if (loginResp && loginResp.code === 0 && loginResp.data) {
                        loginUrl = typeof loginResp.data === 'string' ? loginResp.data : (loginResp.data.url || loginResp.data);
                    }
                    if (!loginUrl) {
                        const base = process.env.LT_LOGIN_BASE_URL || 'https://lt.800best.com/smart/h5/index.html';
                        const params = new URLSearchParams({ shopName: binding.shopName });
                        loginUrl = `${base}?${params.toString()}`;
                    }
                    const accountLabel = binding.loginName || binding.shopName;
                    await sendWechatCustomMessage(wechatUser.openid, `✅ 登录链接已生成\n店铺：${accountLabel}\n👉 <a href="${loginUrl}">点击此处进入打单平台</a>\n(链接有效期较短，请尽快点击)`);
                }
            } catch (err) {
                console.error('图片消息提示失败:', err);
            }

            processContent(message.PicUrl, 'image', wechatUser);
        }
    } catch (error) {
        console.error('消息处理出错:', error);
        if (!res.headersSent) res.send('success');
    }
});

// 3. 获取数据接口
app.get('/api/orders', (req, res) => {
    res.json(orders);
});

// 4. 清空数据接口
app.post('/api/clear', (req, res) => {
    orders = [];
    saveOrders(); // [新增] 同步清空本地文件
    res.json({ success: true });
});

// --- 微信用户绑定管理接口 ---
// 查询用户的所有绑定账户
app.get('/api/wechat/bindings/:openid', (req, res) => {
    try {
        const { openid } = req.params;
        const user = wechatUsers.find(u => u.openid === openid);
        if (!user) {
            return res.json({ code: 1, msg: '用户不存在', data: null });
        }
        res.json({ 
            code: 0, 
            msg: '成功', 
            data: {
                openid: user.openid,
                nickname: user.nickname,
                bindings: user.ltBindings || []
            }
        });
    } catch (err) {
        res.status(500).json({ code: 1, msg: err.message || String(err) });
    }
});

// 为用户添加新的打单账户绑定
app.post('/api/wechat/bindings/:openid', (req, res) => {
    try {
        const { openid } = req.params;
        const { shopName, userKey, loginName } = req.body;
        if (!shopName || !userKey) {
            return res.json({ code: 1, msg: 'shopName 和 userKey 必填' });
        }
        bindLtAccount(openid, shopName, userKey, loginName);
        res.json({ code: 0, msg: '绑定成功' });
    } catch (err) {
        res.status(500).json({ code: 1, msg: err.message || String(err) });
    }
});

// 删除用户的某个绑定
app.delete('/api/wechat/bindings/:openid/:shopName', (req, res) => {
    try {
        const { openid, shopName } = req.params;
        const user = wechatUsers.find(u => u.openid === openid);
        if (!user) {
            return res.json({ code: 1, msg: '用户不存在' });
        }
        const idx = user.ltBindings.findIndex(b => b.shopName === shopName);
        if (idx === -1) {
            return res.json({ code: 1, msg: '绑定不存在' });
        }
        user.ltBindings.splice(idx, 1);
        saveWechatUsers();
        res.json({ code: 0, msg: '删除成功' });
    } catch (err) {
        res.status(500).json({ code: 1, msg: err.message || String(err) });
    }
});

// 切换用户的活跃绑定（将指定 shopName 的绑定移到数组首位）
app.put('/api/wechat/bindings/:openid/switch', (req, res) => {
    try {
        const { openid } = req.params;
        const { shopName } = req.body;
        if (!shopName) {
            return res.json({ code: 1, msg: 'shopName 必填' });
        }
        const user = wechatUsers.find(u => u.openid === openid);
        if (!user) {
            return res.json({ code: 1, msg: '用户不存在' });
        }
        const idx = user.ltBindings.findIndex(b => b.shopName === shopName);
        if (idx === -1) {
            return res.json({ code: 1, msg: '绑定不存在' });
        }
        const [binding] = user.ltBindings.splice(idx, 1);
        user.ltBindings.unshift(binding);
        saveWechatUsers();
        res.json({ code: 0, msg: '切换成功', data: { activeShop: shopName } });
    } catch (err) {
        res.status(500).json({ code: 1, msg: err.message || String(err) });
    }
});

// --- LT 平台回调接收接口（由灵通平台回调） ---
import { handleLtCallback } from './services/ltCallbackHandler.js';

app.post('/api/lt/callback', (req, res) => {
    try {
        const payload = req.body;
        const updatedIds = handleLtCallback(payload, orders);
        if (updatedIds && updatedIds.length > 0) saveOrders();
        res.json({ code: 0, msg: '成功' });
    } catch (err) {
        console.error('LT callback handling failed:', err);
        res.json({ code: 1, msg: String(err) });
    }
});

// --- 核心智能解析逻辑 (已升级支持多模态 + 微信用户绑定) ---
export async function processContent(input, type = 'text', wechatUser = null) {
    try {
        let modelName = "qwen-plus"; // 默认文本模型
        let userMessageContent = input;

        // 如果是图片，构造多模态请求并切换模型
        if (type === 'image') {
            modelName = "qwen-vl-max"; // [新增] 使用视觉模型

            // 尝试下载图片并发送为 data URL，避免直接依赖微信短期 PicUrl
            try {
                const dataUrl = await downloadImageAsBase64(input);
                userMessageContent = [
                    { type: "text", text: "请提取这张图片里的发件人与收件人信息，并为每个联系人标注 role=sender 或 receiver" },
                    { type: "image_url", image_url: { url: dataUrl } }
                ];
            } catch (err) {
                console.warn('图片下载失败，回退为使用原始 URL：', err.message || err);
                userMessageContent = [
                    { type: "text", text: "请提取这张图片里的发件人与收件人信息，并为每个联系人标注 role=sender 或 receiver" },
                    { type: "image_url", image_url: { url: input } }
                ];
            }
        }

        const completion = await client.chat.completions.create({
            model: modelName,
            messages: [
                {
                    role: "system",
                    content: `你是一个物流地址解析助手。请从文本或图片中提取发件人(sender)和收件人(receiver)信息。
                    输出严格的 JSON 数组，每个元素包含: role("sender"或"receiver"), name, phone, province, city, district, detail。
                    角色判定: 出现“发件/寄件/寄出/发货/寄方”等关键词视为 sender；出现“收件/收货/收方/收货地址”等视为 receiver；如果只有一个联系人且无明确关键词，默认 role="receiver"。
                    如果无法识别任何地址，返回 []。
                    示例：[{"role":"sender","name":"张三","phone":"13800000000","province":"浙江省","city":"杭州市","district":"西湖区","detail":"xx路xx号"},{"role":"receiver","name":"李四","phone":"13900000000","province":"上海市","city":"上海市","district":"浦东新区","detail":"张江路88号"}]`
                },
                {
                    role: "user",
                    content: userMessageContent
                }
            ],
            temperature: 0.1,
        });

        // 数据清洗 & 解析 (更鲁棒的 JSON 处理 —— 包含尝试从原始响应抽取 JSON、并在解析失败时请模型纠正)
        const rawContent = completion.choices[0].message.content;
        // 记录原始 AI 响应以便审计
        try {
            const logDir = path.join(__dirname, 'logs');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
            fs.appendFileSync(path.join(logDir, 'raw_ai_responses.log'), `\n=== ${new Date().toISOString()} | model=${modelName} ===\n${rawContent}\n`);
        } catch (err) {
            console.warn('无法写入 raw_ai_responses.log:', err.message || err);
        }

        // 先去除常见 Markdown 包裹
        let content = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();

        async function tryParseAndFix(text) {
            try {
                const parsed = JSON.parse(text);
                return parsed;
            } catch (_) {
                // 尝试从文本中抽取第一个 {..} 或 [..] 快速尝试解析
                const m = text.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/);
                if (m) {
                    try {
                        return JSON.parse(m[0]);
                    } catch (__) {
                        // 继续下一步
                    }
                }

                // 最后一步：请求模型只返回纯 JSON（纠错请求）
                try {
                    const fixPrompt = `原始内容:\n${text}\n\n请仅返回严格的 JSON —— 一个数组或空数组，格式与示例一致：[{"name":"张三","phone":"13800000000","province":"省","city":"市","district":"区","detail":"详细地址"}]`;
                    const fixResp = await client.chat.completions.create({
                        model: modelName,
                        messages: [
                            { role: 'system', content: '你负责将给出的文本解析为纯 JSON 输出：只返回 JSON，不要额外解释。' },
                            { role: 'user', content: fixPrompt }
                        ],
                        temperature: 0.0
                    });
                    const fixed = fixResp.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
                    // 记录修正后的响应
                    try {
                        fs.appendFileSync(path.join(__dirname, 'logs', 'raw_ai_responses.log'), `\n---纠错回应 ${new Date().toISOString()} ---\n${fixed}\n`);
                    } catch (err) { /* ignore */ }
                    return JSON.parse(fixed);
                } catch (err) {
                    throw new Error('无法从模型输出解析出有效 JSON: ' + (err.message || String(err)));
                }
            }
        }

        const dataParsed = await tryParseAndFix(content);
        const contacts = Array.isArray(dataParsed) ? dataParsed : (dataParsed ? [dataParsed] : []);
        const originalText = typeof input === 'string' ? input : '';

        const normalizeContact = (c = {}) => ({
            name: (c.name || '').trim(),
            phone: (c.phone || c.mobile || '').trim(),
            province: (c.province || '').trim(),
            city: (c.city || '').trim(),
            district: (c.district || c.country || '').trim(),
            detail: (c.detail || c.detailAddr || '').trim(),
            role: (c.role || '').toLowerCase()
        });

        const deriveContacts = (arr) => {
            const senders = [];
            const receivers = [];
            const unknowns = [];
            arr.forEach((item) => {
                const info = normalizeContact(item || {});
                if (info.role === 'sender') senders.push(info);
                else if (info.role === 'receiver') receivers.push(info);
                else unknowns.push(info);
            });

            // 简单兜底：如果未识别角色且有两个联系人，默认第一个 sender 第二个 receiver
            if (senders.length === 0 && receivers.length === 0 && unknowns.length >= 2) {
                senders.push(unknowns[0]);
                receivers.push(unknowns[1]);
            } else if (senders.length === 0 && receivers.length === 0 && unknowns.length === 1) {
                receivers.push(unknowns[0]);
            }

            // 关键词辅助：如果仍缺 sender，且文本含发件关键词，则将第一个 unknown 视为 sender
            const senderKeywords = /发件|寄件|寄出|发货/;
            const receiverKeywords = /收件|收货|收货地址/;
            if (senders.length === 0 && unknowns.length > 0 && senderKeywords.test(originalText)) {
                senders.push(unknowns.shift());
            }
            if (receivers.length === 0 && unknowns.length > 0 && receiverKeywords.test(originalText)) {
                receivers.push(unknowns.shift());
            }

            return {
                sender: senders[0] || null,
                receiver: receivers[0] || null
            };
        };

        const { sender, receiver } = deriveContacts(contacts);
        const hasBinding = wechatUser && wechatUser.ltBindings && wechatUser.ltBindings.length > 0;
        const binding = hasBinding ? wechatUser.ltBindings[0] : null;

        const notify = async (msg) => {
            if (wechatUser && wechatUser.openid) {
                try { await sendWechatCustomMessage(wechatUser.openid, msg); } catch (e) { console.warn('客服消息发送失败:', e.message || e); }
            } else {
                console.log('提示消息:', msg);
            }
        };

        if (!sender && !receiver) {
            await notify('❌ 未识别到有效地址，请同时提供发件人和收件人信息。');
            return;
        }

        // 首次使用（未绑定）
        if (!hasBinding) {
            if (!sender || !receiver) {
                await notify('❌ 首次使用请同时提供完整的发件人和收件人信息。');
                return;
            }

            const mobile = sender.phone;
            if (!mobile) {
                await notify('❌ 发件人手机号缺失，无法创建打单账号，请补充发件人手机号。');
                return;
            }

            const safeName = (wechatUser?.nickname || 'wxuser').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, 20);
            const shopName = process.env.LT_SHOP_NAME_PREFIX ? `${process.env.LT_SHOP_NAME_PREFIX}_${safeName}_${Date.now()%10000}` : `wx_${safeName}_${Date.now()%10000}`;

            const userPayload = {
                shopName,
                contactName: sender.name || wechatUser?.nickname || '微信用户',
                province: sender.province || process.env.LT_DEFAULT_PROVINCE || '浙江省',
                city: sender.city || process.env.LT_DEFAULT_CITY || '杭州市',
                country: sender.district || process.env.LT_DEFAULT_DISTRICT || '区',
                detailAddr: sender.detail || process.env.LT_DEFAULT_DETAIL || '由微信解析创建',
                mobile,
                phone: sender.phone
            };

            try {
                const cResp = await createUser(userPayload);
                if (cResp && cResp.code === 0 && cResp.data && cResp.data.userKey) {
                    const userKey = cResp.data.userKey;
                    const respShopName = cResp.data.shopName || shopName;
                    const loginName = cResp.data.loginName;
                    const password = cResp.data.password || '';
                    bindLtAccount(wechatUser.openid, respShopName, userKey, loginName || respShopName, sender);

                    // 记录已创建的店铺
                    try {
                        const createdPath = path.join(__dirname, 'lt_created_users.json');
                        let createdArr = [];
                        if (fs.existsSync(createdPath)) {
                            try { createdArr = JSON.parse(fs.readFileSync(createdPath, 'utf8') || '[]'); } catch (_) { createdArr = []; }
                        }
                        createdArr.push({ shopName: respShopName, loginName: loginName || respShopName, password, userKey, openid: wechatUser.openid, createdAt: new Date().toISOString(), lastSender: sender });
                        fs.writeFileSync(createdPath, JSON.stringify(createdArr, null, 2), 'utf8');
                    } catch (e) {
                        console.warn('写入 lt_created_users.json 失败:', e.message || e);
                    }

                    // 创建首单（使用收件人信息）
                    const orderObj = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        sender,
                        receiver,
                        name: receiver.name,
                        phone: receiver.phone,
                        province: receiver.province,
                        city: receiver.city,
                        district: receiver.district,
                        detail: receiver.detail,
                        fullAddress: `${receiver.province || ''}${receiver.city || ''}${receiver.district || ''}${receiver.detail || ''}`,
                        source: type === 'image' ? '微信-截图' : '微信-文本',
                        createTime: new Date().toLocaleString(),
                        wechatUser: wechatUser ? wechatUser.openid : null
                    };
                    orders.unshift(orderObj);

                    const printResult = await sendToPrinter(orderObj, { shopName: respShopName, userKey });
                    if (printResult && printResult.success) {
                        orderObj.printed = true;
                        orderObj.printResponse = printResult.response || null;
                    } else {
                        orderObj.printed = false;
                        orderObj.printError = (printResult && (printResult.error || printResult.response)) || 'unknown';
                    }
                    saveOrders();

                    // 登录链接
                    let loginUrl = null;
                    try {
                        const loginResp = await getLoginUrl(respShopName, userKey);
                        if (loginResp && loginResp.code === 0 && loginResp.data) {
                            loginUrl = typeof loginResp.data === 'string' ? loginResp.data : (loginResp.data.url || loginResp.data);
                        }
                    } catch (e) { console.warn('获取登录链接失败', e.message || e); }
                    if (!loginUrl) {
                        const base = process.env.LT_LOGIN_BASE_URL || 'https://lt.800best.com/smart/h5/index.html';
                        const params = new URLSearchParams({ shopName: respShopName });
                        loginUrl = `${base}?${params.toString()}`;
                    }

                    await notify(`✅ 已为您创建打单账号并生成首单\n店铺：${loginName || respShopName}\n发件人：${sender.name || ''} ${sender.phone || ''}\n收件人：${receiver.name || ''} ${receiver.phone || ''}\n👉 <a href="${loginUrl}">点击此处进入打单平台</a>\n(链接有效期较短，请尽快点击)`);
                } else {
                    await notify(`❌ 创建打单账号失败：${cResp?.msg || '未知错误'}`);
                }
            } catch (err) {
                console.error('创建店铺异常:', err);
                await notify('❌ 创建打单账号异常，请稍后再试');
            }
            return;
        }

        // 已绑定用户
        const shopName = binding.shopName;
        const userKey = binding.userKey;

        const updateSenderOnLt = async (info) => {
            const payload = {
                shopName,
                contactName: info.name,
                province: info.province,
                city: info.city,
                country: info.district,
                detailAddr: info.detail,
                mobile: info.phone,
                phone: info.phone
            };
            return updateUser(payload);
        };

        const ensureSender = async () => {
            if (sender) return sender;
            if (binding.lastSender) return binding.lastSender;
            try {
                const info = await getUserInfo(shopName);
                if (info && info.code === 0 && info.data) {
                    const data = info.data;
                    const s = normalizeContact({
                        role: 'sender',
                        name: data.contactName,
                        phone: data.mobile || data.phone,
                        province: data.province,
                        city: data.city,
                        district: data.country,
                        detail: data.detailAddr
                    });
                    return s;
                }
            } catch (e) {
                console.warn('获取用户信息失败:', e.message || e);
            }
            return null;
        };

        // 情况：仅发件人 -> 更新发件人信息
        if (sender && !receiver) {
            try {
                const uResp = await updateSenderOnLt(sender);
                if (uResp && uResp.code === 0) {
                    binding.lastSender = sender;
                    saveWechatUsers();
                    await notify(`✅ 发件人信息已更新\n店铺：${binding.loginName || shopName}\n姓名：${sender.name || ''}\n电话：${sender.phone || ''}`);
                } else {
                    await notify(`❌ 发件人更新失败：${uResp?.msg || '未知错误'}`);
                }
            } catch (err) {
                console.error('更新发件人异常:', err);
                await notify('❌ 发件人更新异常，请稍后再试');
            }
            return;
        }

        // 情况：仅收件人 -> 用已有发件人创建订单
        if (!sender && receiver) {
            const senderForOrder = await ensureSender();
            if (!senderForOrder) {
                await notify('❌ 未找到发件人信息，请先发送发件人地址。');
                return;
            }

            const orderObj = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                sender: senderForOrder,
                receiver,
                name: receiver.name,
                phone: receiver.phone,
                province: receiver.province,
                city: receiver.city,
                district: receiver.district,
                detail: receiver.detail,
                fullAddress: `${receiver.province || ''}${receiver.city || ''}${receiver.district || ''}${receiver.detail || ''}`,
                source: type === 'image' ? '微信-截图' : '微信-文本',
                createTime: new Date().toLocaleString(),
                wechatUser: wechatUser ? wechatUser.openid : null
            };
            orders.unshift(orderObj);

            const printResult = await sendToPrinter(orderObj, { shopName, userKey, loginName: binding.loginName });
            if (printResult && printResult.success) {
                orderObj.printed = true;
                orderObj.printResponse = printResult.response || null;
                let loginUrl = null;
                try {
                    const loginResp = await getLoginUrl(shopName, userKey);
                    if (loginResp && loginResp.code === 0 && loginResp.data) {
                        loginUrl = typeof loginResp.data === 'string' ? loginResp.data : (loginResp.data.url || loginResp.data);
                    }
                } catch (e) { /* ignore */ }
                if (!loginUrl) {
                    const base = process.env.LT_LOGIN_BASE_URL || 'https://lt.800best.com/smart/h5/index.html';
                    const params = new URLSearchParams({ shopName });
                    loginUrl = `${base}?${params.toString()}`;
                }
                await notify(`✅ 已创建订单（使用上次发件人信息）\n收件人：${receiver.name || ''} ${receiver.phone || ''}\n👉 <a href="${loginUrl}">点击此处进入打单平台</a>`);
            } else {
                orderObj.printed = false;
                orderObj.printError = (printResult && (printResult.error || printResult.response)) || 'unknown';
                await notify(`❌ 订单创建失败：${orderObj.printError}`);
            }
            saveOrders();
            return;
        }

        // 情况：发件人与收件人均有 -> 更新发件人后建单
        if (sender && receiver) {
            let updated = false;
            try {
                const uResp = await updateSenderOnLt(sender);
                if (uResp && uResp.code === 0) {
                    binding.lastSender = sender;
                    saveWechatUsers();
                    updated = true;
                } else {
                    await notify(`❌ 发件人更新失败：${uResp?.msg || '未知错误'}`);
                    return;
                }
            } catch (err) {
                console.error('更新发件人异常:', err);
                await notify('❌ 发件人更新异常，请稍后再试');
                return;
            }

            const orderObj = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                sender,
                receiver,
                name: receiver.name,
                phone: receiver.phone,
                province: receiver.province,
                city: receiver.city,
                district: receiver.district,
                detail: receiver.detail,
                fullAddress: `${receiver.province || ''}${receiver.city || ''}${receiver.district || ''}${receiver.detail || ''}`,
                source: type === 'image' ? '微信-截图' : '微信-文本',
                createTime: new Date().toLocaleString(),
                wechatUser: wechatUser ? wechatUser.openid : null
            };
            orders.unshift(orderObj);

            const printResult = await sendToPrinter(orderObj, { shopName, userKey, loginName: binding.loginName });
            if (printResult && printResult.success) {
                orderObj.printed = true;
                orderObj.printResponse = printResult.response || null;
                let loginUrl = null;
                try {
                    const loginResp = await getLoginUrl(shopName, userKey);
                    if (loginResp && loginResp.code === 0 && loginResp.data) {
                        loginUrl = typeof loginResp.data === 'string' ? loginResp.data : (loginResp.data.url || loginResp.data);
                    }
                } catch (e) { /* ignore */ }
                if (!loginUrl) {
                    const base = process.env.LT_LOGIN_BASE_URL || 'https://lt.800best.com/smart/h5/index.html';
                    const params = new URLSearchParams({ shopName });
                    loginUrl = `${base}?${params.toString()}`;
                }
                await notify(`✅ 发件人已更新并创建新订单\n发件人：${sender.name || ''} ${sender.phone || ''}\n收件人：${receiver.name || ''} ${receiver.phone || ''}\n👉 <a href="${loginUrl}">点击此处进入打单平台</a>`);
            } else {
                orderObj.printed = false;
                orderObj.printError = (printResult && (printResult.error || printResult.response)) || 'unknown';
                await notify(`❌ 订单创建失败：${orderObj.printError}`);
            }
            saveOrders();
            return;
        }

        await notify('❌ 未能处理该消息，请检查格式。');

    } catch (err) {
        console.error('AI 解析失败:', err);
    }
}

// 默认总是启动 HTTP 服务；若需要在测试场景跳过，可设置 SKIP_HTTP_SERVER=true
if (process.env.SKIP_HTTP_SERVER === 'true') {
    console.log('已设置 SKIP_HTTP_SERVER=true，跳过 HTTP 服务启动');
} else {
    app.listen(PORT, () => {
        console.log(`后端服务已启动: http://localhost:${PORT}`);
        console.log(`数据存储路径: ${DATA_FILE}`);
    });
}

// 从 AI 原始回应中尝试抽取或清洗出 JSON 文本（不做模型纠错）
export function tryExtractJsonString(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') return null;
    let content = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    // 优先尝试完整内容
    try { JSON.parse(content); return content; } catch (_) {}
    // 提取第一个对象/数组片段
    const m = content.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/);
    if (m) return m[0];
    return null;
}
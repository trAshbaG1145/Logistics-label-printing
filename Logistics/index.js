import express from 'express';
import bodyParser from 'body-parser';
import xml2js from 'xml2js';
import sha1 from 'sha1';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs'; // [新增] 引入文件系统模块
import { sendOrder as sendToPrinter } from './services/printerAdapters/index.js';
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
        console.log(`已加载本地数据，共 ${orders.length}Dd 条订单`);
    } catch (e) {
        console.error('读取本地数据失败，将使用空数组初始化');
    }
}

// 保存数据到本地的辅助函数
const saveOrders = () => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2));
};

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

        console.log(`收到消息类型: ${message.MsgType}`);

        if (message.MsgType === 'text') {
            // 处理文本消息
            processContent(message.Content, 'text');
        } else if (message.MsgType === 'image') {
            // [新增] 处理图片消息
            console.log('收到图片，URL:', message.PicUrl);
            processContent(message.PicUrl, 'image');
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

// --- 核心智能解析逻辑 (已升级支持多模态) ---
export async function processContent(input, type = 'text') {
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
                    { type: "text", text: "请提取这张图片里的物流收件人信息。" },
                    // 模型端如果支持 data URL，会更稳定；同时保留原始 URL 作为回退
                    { type: "image_url", image_url: { url: dataUrl } }
                ];
            } catch (err) {
                console.warn('图片下载失败，回退为使用原始 URL：', err.message || err);
                userMessageContent = [
                    { type: "text", text: "请提取这张图片里的物流收件人信息。" },
                    { type: "image_url", image_url: { url: input } }
                ];
            }
        }

        const completion = await client.chat.completions.create({
            model: modelName,
            messages: [
                {
                    role: "system",
                    content: `你是一个物流地址解析助手。请提取收件人信息(姓名,电话,省,市,区,详细地址)。
                    如果无法识别或不包含地址，返回空数组 []。
                    必须严格只返回纯 JSON 字符串，不要使用 markdown 格式。
                    返回格式示例：
                    [{"name":"张三","phone":"13800000000","province":"浙江省","city":"杭州市","district":"西湖区","detail":"xx路xx号"}]`
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
        let data = dataParsed;
        if (!Array.isArray(data)) data = [data];

        // 存入数据库
        let newCount = 0;
        const addedOrders = [];
        data.forEach(item => {
            if (item.name || item.phone || item.detail) {
                const orderObj = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    ...item,
                    fullAddress: `${item.province || ''}${item.city || ''}${item.district || ''}${item.detail || ''}`,
                    source: type === 'image' ? '微信-截图' : '微信-文本',
                    createTime: new Date().toLocaleString()
                };
                orders.unshift(orderObj);
                addedOrders.push(orderObj);
                newCount++;
            }
        });

        if (newCount > 0) {
            saveOrders(); // [新增] 保存到本地文件
            console.log(`解析成功，新增 ${newCount} 条。`);

            // 尝试把新增订单提交给打印平台适配器（如果配置了）
            for (const newOrder of addedOrders) {
                try {
                    const printResult = await sendToPrinter(newOrder);
                    if (printResult && printResult.success) {
                        newOrder.printed = true;
                        newOrder.printResponse = printResult.response || null;
                        console.log(`订单 ${newOrder.id} 已提交打印平台，返回:`, printResult.response);
                    } else if (printResult && printResult.skipped) {
                        console.log(`订单 ${newOrder.id} 打单适配器跳过（未配置）`);
                    } else {
                        newOrder.printed = false;
                        newOrder.printError = printResult && (printResult.error || printResult.response) || 'unknown';
                        console.warn(`订单 ${newOrder.id} 打单失败:`, newOrder.printError);
                    }
                } catch (err) {
                    newOrder.printed = false;
                    newOrder.printError = err.message || String(err);
                    console.error(`提交订单 ${newOrder.id} 到打印平台发生异常:`, err);
                }
            }

            // 保存 print 状态回 orders.json
            saveOrders();
        } else {
            console.log("AI 未识别到有效地址信息。");
        }

    } catch (err) {
        console.error('AI 解析失败:', err);
    }
}

if (process.env.NODE_ENV !== 'test') {
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
import express from 'express';
import bodyParser from 'body-parser';
import xml2js from 'xml2js';
import sha1 from 'sha1';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs'; // [新增] 引入文件系统模块
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
const client = new OpenAI({
    apiKey: process.env.BAILIAN_API_KEY,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
});

app.use(cors());
app.use(bodyParser.text({ type: '*/xml' }));
app.use(express.json());

// 1. 微信验证接口
app.get('/wechat', (req, res) => {
    console.log('收到微信验证请求:', req.query);
    const { signature, timestamp, nonce, echostr } = req.query;
    const token = 'mytesttoken'; // 必须与微信后台一致
    const str = [token, timestamp, nonce].sort().join('');
    const sha = sha1(str);

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

// --- 核心智能解析逻辑 (已升级支持多模态) ---
async function processContent(input, type = 'text') {
    try {
        let modelName = "qwen-plus"; // 默认文本模型
        let userMessageContent = input;

        // 如果是图片，构造多模态请求并切换模型
        if (type === 'image') {
            modelName = "qwen-vl-max"; // [新增] 使用视觉模型
            userMessageContent = [
                { type: "text", text: "请提取这张图片里的物流收件人信息。" },
                { type: "image_url", image_url: { url: input } }
            ];
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

        // 数据清洗
        let content = completion.choices[0].message.content;
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();

        // 解析 JSON
        let data = JSON.parse(content);
        if (!Array.isArray(data)) data = [data];

        // 存入数据库
        let newCount = 0;
        data.forEach(item => {
            if (item.name || item.phone || item.detail) {
                orders.unshift({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    ...item,
                    fullAddress: `${item.province || ''}${item.city || ''}${item.district || ''}${item.detail || ''}`,
                    source: type === 'image' ? '微信-截图' : '微信-文本',
                    createTime: new Date().toLocaleString()
                });
                newCount++;
            }
        });

        if (newCount > 0) {
            saveOrders(); // [新增] 保存到本地文件
            console.log(`解析成功，新增 ${newCount} 条。`);
        } else {
            console.log("AI 未识别到有效地址信息。");
        }

    } catch (err) {
        console.error('AI 解析失败:', err);
    }
}

app.listen(PORT, () => {
    console.log(`后端服务已启动: http://localhost:${PORT}`);
    console.log(`数据存储路径: ${DATA_FILE}`);
});
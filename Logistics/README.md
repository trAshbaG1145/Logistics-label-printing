# Logistics 服务（本地运行说明）

这是微信 + 大模型的智能物流打单后端（示例实现）。

快速启动
- 安装依赖：
```powershell
cd Logistics; npm install
```
- 填写环境变量：复制 `.env.example` 到 `.env` 并填入相应值（不要提交 `.env`）
- 启动服务：
```powershell
npm start
```
- 运行单元测试（小型解析测试）：
```powershell
npm test
```

重要环境变量
- BAILIAN_API_KEY: 阿里云百炼/OpenAI 兼容的 API key（用于 qwen-plus / qwen-vl-max）。
- WECHAT_TOKEN: 与微信后台一致的 token，用于 GET 验证。推荐在微信后台配置为同一值。
- PRINTER_ADAPTER: 选择打印适配器（默认 `lt`）。
- LT_APP_ID / LT_TOKEN: 灵通平台适配器需要的凭证（若启用请填写）。请参考：https://ltopen.800best.com/doc

主要文件与职责
- `index.js`：主服务，接收微信回调、调用大模型解析并持久化到 `orders.json`，解析成功时还会尝试调用打印平台适配器。
- `orders.json`：本地存储解析后的订单。
- `services/printerAdapters/`：打印平台适配器目录，包含 `lt.js`（灵通）与选择器 `index.js`。

注意事项
- 仓库中不应包含真实密钥（`.env` 已被添加至 `.gitignore`）。在推送前请移除任何泄露的凭据。
- 微信返回的 `PicUrl` 可能是短期有效或不可直接被模型访问；此服务会尝试下载并以 dataURL 发送给模型以提高可靠性。
- AI 返回的结果必须是严格 JSON。本项目在解析失败时会尝试抽取 JSON 片段或再次请求模型纠错，并将原始响应记录到 `Logistics/logs/raw_ai_responses.log` 以便审计。

下一步建议
- 增加对打印平台返回的监控与重试策略
- 将本地存储替换为轻量数据库（sqlite/lowdb），以便更好地并发与持久化管理
- 为完整的端到端流程编写集成测试（模拟微信回调 + 模型输出 + 打单 API）

# Copilot 使用说明（针对 Logistics-label-printing 项目）

目的：帮助 AI 代码助手快速理解本仓库的架构、关键文件、运行方式与约定，便于在此基础上修改或扩展功能。

快速启动
- 安装依赖：在 `Logistics` 目录运行 `npm install`。
- 启动服务：在 `Logistics` 目录运行 `npm start`（等价于 `node index.js`，默认端口 `3001`）。
- 查看数据：访问 `http://localhost:3001/api/orders` 获取解析后的订单数组。

架构与核心流程（大局观）
- `Logistics/index.js` 是唯一后端入口：一个小型 Express 服务，用于接收微信回调（`/wechat`）、保存解析结果（本地 `orders.json`）并暴露查询/清空接口（`/api/orders`, `/api/clear`）。
- 消息处理流程：微信 POST -> 立即返回 `success`（避免微信重试）-> 异步调用 `processContent` 使用大模型解析地址 -> 将解析结果写入 `orders.json`。
- 模型与 API：使用 `openai` 客户端并通过环境变量 `BAILIAN_API_KEY` 指向阿里云百炼兼容接口，模型名在代码中为 `qwen-plus`（文本）和 `qwen-vl-max`（视觉）。

数据与持久化
- 本地存储：`Logistics/orders.json`（文件存在则启动时读取），写入通过 `saveOrders()` 同步到磁盘。
- 记录结构示例（代码中生成）：
  {
    id, name, phone, province, city, district, detail, fullAddress, source, createTime
  }

重要约定与项目特有风格
- AI 必须返回“纯 JSON 字符串”，代码通过简单的替换去除 Markdown 代码块并使用 `JSON.parse` 解析。务必保持返回为数组/对象的严格 JSON。
- 图片处理：收到图片时服务器将从 `message.PicUrl` 直接把 URL 交给模型（注意：微信的 `PicUrl` 可能是短期可用链接，且模型端可能无法访问该 URL）。
- 微信验证：GET `/wechat` 使用固定 token `mytesttoken`（硬编码），签名校验通过 `sha1` 完成。

关键文件
- `Logistics/index.js`：后端主逻辑与所有约定。
- `Logistics/package.json`：启动脚本与依赖。
- `Logistics/.env.example`：列出 `BAILIAN_API_KEY`。
- `Logistics/.env`：当前仓库包含了一个实键（请移除并重置），不要在提交中保留真实密钥。
- `打单模板/灵通打单模板/说明.txt`：模板与第三方平台使用说明（仅为参考）。

开发与调试要点（代码助手应遵守）
- 更改 `mytesttoken` 或微信交互逻辑前，先确认微信端配置与校验流程；不要随意移除立即返回 `success` 的逻辑。
- 不要将真实 API key 提交到仓库。修改 `.env` 请在 `.gitignore` 中排除并要求使用者在本地填入。
- 当处理图片时，优先实现“下载到本地/临时公开 URL/转为 multipart 上传给模型”的流程，避免直接依赖微信 `PicUrl` 的可访问性。
- 模型调用假设返回严格 JSON；若需要更稳健解析，建议加入容错解析和多轮纠错（当 JSON.parse 失败时，尝试抽取第一个 JSON 对象或提示重试）。

可交付改进方向（短期优先级）
- 实装“打单平台 API”适配层：当前尚未实现把解析后的信息提交到第三方打单网站的 HTTP API 或自动填单流程。
- 增加安全：把 `mytesttoken` 与 `BAILIAN_API_KEY` 放入环境变量并移除仓库中的明文密钥。
- 改进图片多模态流程：下载图片、确保存储/转发可被模型访问或使用模型的文件上传接口。
- 增加单元/集成测试，至少覆盖 `processContent` 的解析与 `saveOrders` 的写入行为。

如果你想让我直接实现上述某一项（例如：添加打印平台适配器、修复密钥泄露、或增强图片处理），请告诉我优先级与目标平台，我会提交 patch。

——
如果本文件有遗漏或要补充具体的第三方打单 API 示例，请指出目标平台及凭证（敏感信息请用安全方式提供），我可以继续分步实现。

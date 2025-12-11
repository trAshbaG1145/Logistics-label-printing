# Copilot 使用说明(针对 Logistics-label-printing 项目)

目的:帮助 AI 代码助手快速理解本仓库的架构、关键文件、运行方式与约定,便于在此基础上修改或扩展功能。

快速启动
- 安装依赖:在 `Logistics` 目录运行 `npm install`。
- 启动服务:在 `Logistics` 目录运行 `npm start`(等价于 `node index.js`,默认端口 `3001`)。
- 查看数据:访问 `http://localhost:3001/api/orders` 获取解析后的订单数组。

架构与核心流程(大局观)
- `Logistics/index.js` 是唯一后端入口:一个小型 Express 服务,用于接收微信回调(`/wechat`)、保存解析结果(本地 `orders.json`)并暴露查询/清空接口(`/api/orders`, `/api/clear`)。
- 消息处理流程:微信 POST -> 立即返回 `success`(避免微信重试)-> 异步调用 `processContent` 使用大模型解析地址 -> 自动创建店铺(如果用户未绑定)-> 将解析结果写入 `orders.json`。
- 模型与 API:使用 `openai` 客户端并通过环境变量 `BAILIAN_API_KEY` 指向阿里云百炼兼容接口,模型名在代码中为 `qwen-plus`(文本)和 `qwen-vl-max`(视觉)。

数据与持久化
- 本地存储:`Logistics/orders.json`(文件存在则启动时读取),写入通过 `saveOrders()` 同步到磁盘。
- 用户绑定:`Logistics/wechat_users.json` 存储微信用户与 LT 店铺绑定关系。
- 创建记录:`Logistics/lt_created_users.json` 记录自动创建的店铺审计日志。
- 订单结构示例(代码中生成):
  {
    id, name, phone, province, city, district, detail, fullAddress, source, createTime, wechatUser
  }

重要约定与项目特有风格
- AI 必须返回"纯 JSON 字符串"，代码通过简单的替换去除 Markdown 代码块并使用 `JSON.parse` 解析。务必保持返回为数组/对象的严格 JSON。
- 图片处理：收到图片时服务器将从 `message.PicUrl` 下载图片并转为 base64 data URL 传给模型，避免依赖微信短期链接。
- 微信验证：GET `/wechat` 使用环境变量 `WECHAT_TOKEN` 进行签名校验（通过 `sha1` 完成）。
- 自动创建店铺：当 `LT_AUTO_CREATE=true` 且用户未绑定店铺时，系统会自动创建灵通打单店铺并发送登录链接给用户。
- 地址智能识别：系统会检测关键词（发件人/寄件人等）判断是发件人还是收件人地址，自动选择使用解析地址还是默认配置。

关键文件
- `Logistics/index.js`：后端主逻辑与所有约定，包含自动创建店铺功能。
- `Logistics/services/printerAdapters/lt.js`：灵通平台 API 封装，包含 createUser, getLoginUrl, sendOrder 等。
- `Logistics/package.json`：启动脚本与依赖。
- `Logistics/.env.example`：列出所有环境变量配置说明。
- `打单模板/灵通打单模板/说明.txt`：模板与第三方平台使用说明（仅为参考）。
- `docs/AUTO_SHOP_CREATION.md`：自动创建店铺功能的完整文档。

开发与调试要点（代码助手应遵守）
- 更改 `WECHAT_TOKEN` 或微信交互逻辑前，先确认微信端配置与校验流程；不要随意移除立即返回 `success` 的逻辑。
- 不要将真实 API key 提交到仓库。修改 `.env` 请在 `.gitignore` 中排除并要求使用者在本地填入。
- 图片处理已实现下载转 base64 流程，模型端可以稳定访问图片内容。
- 模型调用包含容错解析和多轮纠错机制，当 JSON.parse 失败时会尝试抽取 JSON 或请求模型重新输出。
- 自动创建店铺需要提供有效手机号（LT 平台要求），否则会跳过创建。

核心功能说明
- **自动创建店铺**：`LT_AUTO_CREATE=true` 时，首次发送地址的用户会自动创建 LT 店铺并绑定，登录链接通过微信客服消息发送。
- **地址类型识别**：通过关键词（发件人/寄件人/发货地址/寄件地址/寄出地址）判断地址是发件人还是收件人信息，自动选择使用策略。
- **打单平台集成**：已实现灵通（LT）平台适配器，支持创建店铺、提交订单、接收回调更新状态。
- **数据追踪**：订单关联微信用户 openid，创建的店铺记录到审计日志 `lt_created_users.json`。

环境变量说明
必需：
- `BAILIAN_API_KEY`：AI 模型 API 密钥
- `WECHAT_TOKEN`：微信验证 token
- `LT_APP_ID` / `LT_APP_KEY`：灵通平台凭证
- `WECHAT_APPID` / `WECHAT_APPSECRET`：微信公众号凭证（用于发送客服消息）

可选：
- `LT_AUTO_CREATE`：是否启用自动创建店铺（true/false，默认 false）
- `LT_SHOP_NAME_PREFIX`：店铺名称前缀（默认 wx）
- `LT_DEFAULT_SENDER_*`：默认发件人信息配置（NAME/PROVINCE/CITY/DISTRICT/DETAIL/MOBILE）
- `LT_LOGIN_BASE_URL`：LT 登录页面 URL（用于切换测试/生产环境）

相关文档：参考 `docs/AUTO_SHOP_CREATION.md` 了解自动创建店铺功能的详细信息。

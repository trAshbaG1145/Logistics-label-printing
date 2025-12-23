# AI 协作指南（Agents Readme）

面向通用 AI/代理的速览，帮助在本项目中安全、高效地生成代码与文档。代码主体位于 `Logistics/index.js`，为微信消息解析 + 灵通打单集成服务。

## 项目概览
- 技术栈：Node.js (ESM) + Express，阿里云百炼 LLM，多渠道 HTTP/HTTPS 请求，文件持久化。
- 核心职责：解析微信文本/图片中的收件或发件信息 → 生成/更新订单 → 触发灵通打印或更新发件人 → 管理微信-灵通账户绑定与 OAuth/免密登录。
- 持久化文件：`orders.json`（订单）、`wechat_users.json`（微信绑定）、`logs/raw_ai_responses.log`（模型原始/纠错响应）。

## 关键入口与模块
- 服务器入口：`Logistics/index.js`
  - `/wechat` GET：签名校验
  - `/wechat` POST：文本/图片消息接收，指令“打印”返回免密登录链接，其他内容交由 `processContent`
  - `/api/orders`、`/api/clear`：订单读/清空
  - `/api/wechat/menu/bind`：自定义菜单创建
  - `/api/lt/*`：绑定/解绑/查询，OAuth 登录链路，灵通回调接收
- AI 解析：`processContent(input, type, wechatUser)`
  - 文本用 `qwen-plus`，图片用 `qwen-vl-max`
  - 结果 JSON 清洗与纠错（必要时二次模型调用）
  - 识别“发件人/寄件人”意图时更新或创建灵通账号；否则生成订单并尝试打印
- 打印适配器：`services/printerAdapters/index.js` 的 `sendOrder`
- 灵通 OAuth/回调：`services/ltOAuthHandler.js`、`services/ltCallbackHandler.js`

## 配置要点（.env）
- 微信：`WECHAT_APPID`、`WECHAT_APPSECRET`、`WECHAT_TOKEN`、`WECHAT_BIND_PAGE_URL`
- 灵通：`LT_BASE_URL`、`LT_APP_ID`、`LT_APP_KEY`/`LT_TOKEN`、`LT_SHOP_NAME`、`LT_USER_KEY`
- AI：`BAILIAN_API_KEY`（缺失则禁用 AI 解析）
- 其他：`SKIP_HTTP_SERVER=true` 跳过启动（测试）

## 开发注意事项
- 维持 ESM 风格 `import`，避免改为 CommonJS。
- 修改 AI 解析逻辑时，保持“只返回 JSON”约束与纠错流程，避免将非 JSON 传入后续逻辑。
- 任何新增外部调用需考虑超时/错误日志，不要吞异常。
- 操作订单或用户数据后调用对应 `saveOrders` / `saveWechatUsers` 确保持久化。
- 打印路径：优先使用微信绑定的灵通账户（`ltBindings[0]`），保持兼容。

## 测试与验证建议
- 单元/集成测试重点：`processContent` 的 JSON 清洗、发件人意图分支、打印适配调用结果分支。
- 本地联调：需有效的微信/灵通/百炼配置；无配置可设置 `SKIP_HTTP_SERVER` 仅跑函数逻辑。
- 观察日志：终端输出 + `logs/raw_ai_responses.log`，留意体积与隐私。

## 变更指南（对 AI）
- 如需新增接口：保持 REST 风格，返回 `{ code, msg, data }` 结构，错误用 4xx/5xx 合理设置。
- 如需扩展模型：可通过环境变量切换模型名，默认保持现有。
- 遇到不明配置或业务规则：在修改前提出澄清，而非猜测。


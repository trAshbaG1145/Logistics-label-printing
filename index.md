# 项目说明（`Logistics/index.js`）

本项目是一个基于 Express 的微信收件信息解析与自动打单服务，支持文本/图片消息解析、微信账号与灵通打单账户绑定、订单持久化与打印转发，以及灵通平台 OAuth、免密登录链接和自定义菜单管理。

## 运行与环境
- 启动端口：`3001`（可通过 `.env` 配置其他参数）。
- 关键环境变量：
  - 微信：`WECHAT_APPID`、`WECHAT_APPSECRET`、`WECHAT_TOKEN`、`WECHAT_BIND_PAGE_URL`
  - 灵通：`LT_BASE_URL`、`LT_APP_ID`、`LT_APP_KEY`/`LT_TOKEN`、`LT_SHOP_NAME`、`LT_USER_KEY`
  - AI：`BAILIAN_API_KEY`（阿里云百炼，未配置则 AI 解析禁用）
  - 其他：`SKIP_HTTP_SERVER=true` 可跳过 HTTP 启动（测试用）
- 本地数据：
  - 订单：`orders.json`
  - 微信用户绑定：`wechat_users.json`
  - AI 原始响应日志：`logs/raw_ai_responses.log`

## 核心功能
- 微信接入与消息处理
  - `GET /wechat`：签名校验。
  - `POST /wechat`：接收文本/图片消息，立即回复 `success`，后台解析。
  - 文本指令 `打印`：调用灵通免密登录链接并通过客服消息返回。
  - 其它文本/图片：调用百炼模型提取姓名、电话、地址；未能解析返回空。
- AI 解析
  - 文本：`qwen-plus`；图片：`qwen-vl-max`，优先下载图片转 data URL，回退原始 URL。
  - 解析结果进行 JSON 清洗与纠错，失败会再次让模型输出纯 JSON。
- 订单处理
  - 解析出的地址生成订单对象（含 `fullAddress`、来源、时间、关联 openid），写入 `orders.json`。
  - 若存在已绑定的灵通账户，调用打印适配器 `sendToPrinter` 提交打印，记录打印结果。
- 微信用户与灵通账户
  - 数据结构：`wechat_users.json` 存储 `openid`、`nickname`、`ltBindings`（shopName/userKey/loginName）。
  - `POST /api/lt/bind` / `POST /api/lt/unbind` / `GET /api/lt/accounts/:openid`：手动绑定、解绑、查询。
  - OAuth 自动登录流程：`/api/lt/check-binding/:openid`、`/api/lt/login-url/:openid`、`/api/lt/oauth/callback`（由 `createOAuthHandlers` 提供）。
- 灵通平台接口
  - 通用请求封装 `callLtApi`（MD5 签名，`application/x-www-form-urlencoded`）。
  - 用户创建/更新：`createLtUser`、`updateLtUser`。
  - 免密登录链接：`getLtLoginUrl`。
- 微信自定义菜单
  - `POST /api/wechat/menu/bind`：创建菜单（默认“账户绑定” view 按钮，支持自定义 body.menu）。

## REST 接口汇总
- 数据
  - `GET /api/orders`：获取订单列表。
  - `POST /api/clear`：清空订单（同时写回文件）。
- 微信菜单
  - `POST /api/wechat/menu/bind`：创建/更新自定义菜单。
- 灵通绑定与 OAuth
  - `POST /api/lt/bind`：绑定微信用户与店铺。
  - `POST /api/lt/unbind`：解绑。
  - `GET /api/lt/accounts/:openid`：查询绑定。
  - `GET /api/lt/check-binding/:openid`、`GET /api/lt/login-url/:openid`、`GET /api/lt/oauth/callback`：OAuth/免密登录链路。
- 灵通回调
  - `POST /api/lt/callback`：接收灵通平台回调，更新订单并持久化。

## 处理流程要点
1) 微信消息到达 → 立即 `success` → 根据类型选择模型调用 AI → 清洗/纠错 JSON。  
2) 若文本包含“发件人/寄件人”意图：使用已有绑定更新店铺发件人；无绑定则创建灵通账号并绑定。  
3) 普通收件地址：生成订单，持久化，若有绑定则尝试打印适配器提交。  
4) 日志与数据全程落盘，避免重启丢失；无 AI key 时仅跳过解析能力。  

## 运行建议
- 启动前完整配置 `.env`，特别是微信与灵通参数。
- 生产环境请设置 `WECHAT_TOKEN`，并确保网络可访问微信/灵通/百炼域名。
- 关注 `logs/raw_ai_responses.log`、`orders.json`、`wechat_users.json` 体积与权限，必要时做日志轮转与备份。


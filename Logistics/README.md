# Logistics 服务（本地运行说明）

这是微信 + 大模型的智能物流打单后端（示例实现）。

## 快速启动

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

## 核心功能

### 1. 微信消息接收与 AI 解析
- 接收微信文本/图片消息（POST `/wechat`）
- 调用大模型（qwen-plus 文本, qwen-vl-max 图像）自动提取收件人信息
- 将解析结果存储到 `orders.json`

### 2. 微信用户账户绑定（NEW）
用户可以绑定自己的打单平台账户，系统会自动将该微信用户发送的订单提交到其绑定的打单平台账户。

**数据存储：** `wechat_users.json`（gitignored）

**用户绑定结构示例：**
```json
[
  {
    "openid": "weixin_user_id",
    "nickname": "用户昵称",
    "bindTime": "2025-12-08T11:47:53.509Z",
    "ltBindings": [
      {
        "shopName": "用户的打单账户名",
        "userKey": "账户 API 密钥",
        "bindAt": "2025-12-08T11:47:53.510Z"
      }
    ]
  }
]
```

**支持的账户绑定操作：**

| 操作 | 方法 | 端点 | 参数 | 说明 |
|------|------|------|------|------|
| 绑定账户 | POST | `/api/lt/bind` | `{openid, shopName, userKey}` | 将微信用户与打单账户绑定，支持多账户绑定 |
| 查询绑定 | GET | `/api/lt/accounts/:openid` | openid | 查看该微信用户已绑定的所有打单账户 |
| 解绑账户 | POST | `/api/lt/unbind` | `{openid, shopName}` | 解除微信用户与指定打单账户的绑定 |

**绑定账户 API 示例：**
```bash
curl -X POST http://localhost:3001/api/lt/bind \
  -H "Content-Type: application/json" \
  -d '{
    "openid": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
    "shopName": "my_shop_001",
    "userKey": "ae08d4f008b7422abef5abdd9d8df116"
  }'
```

### 3. 自动打单
- 微信用户发送物流信息 → 系统自动解析 → 使用用户绑定的打单账户自动提交订单
- 订单会记录关联的微信用户 openid，实现用户→订单的关联追踪
- 如果用户有多个绑定账户，默认使用第一个；未来可扩展为用户选择

### 4. 打单平台回调处理
- 灵通平台通过 `/api/lt/callback` 端点回调订单状态更新
- 系统自动更新 orders.json 中的订单状态（PRINTED_SEND / CONSIGNED 等）

## 重要环境变量

- `BAILIAN_API_KEY`: 阿里云百炼/OpenAI 兼容的 API key（用于 qwen-plus / qwen-vl-max）
- `WECHAT_TOKEN`: 与微信后台一致的 token，用于 GET 验证。推荐在微信后台配置为同一值
- `PRINTER_ADAPTER`: 选择打印适配器（默认 `lt`）
- `LT_APP_ID` / `LT_TOKEN`: 灵通平台适配器需要的凭证（若启用请填写）。参考：https://ltopen.800best.com/doc
- `LT_BASE_URL`: (可选) 灵通平台 API 基础 URL，默认为生产环境

## 主要文件与职责

- `index.js`：主服务入口
  - 接收微信回调（POST `/wechat` for messages, GET `/wechat` for verification）
  - 调用大模型解析并持久化到 `orders.json`
  - 管理微信用户账户绑定（加载/保存 `wechat_users.json`）
  - 提供账户绑定 API 端点（`/api/lt/*`）
  
- `orders.json`：本地存储解析后的订单

- `wechat_users.json`：本地存储微信用户与打单平台账户的绑定关系

- `services/printerAdapters/`：打印平台适配器
  - `lt.js`：灵通平台适配器，支持 user/shop 创建、订单提交、登录 URL 获取等
  - `index.js`：适配器选择器

- `test/`：测试用例
  - `test_parse_extract.js`：JSON 提取助手测试
  - `test_lt_adapter.js`：灵通适配器（含 mock 服务器）测试
  - `test_lt_callback.js`：回调处理测试
  - `test_wechat_user_binding.js`：微信用户账户绑定完整流程测试

## 完整工作流示例

1. **用户在微信服务号中绑定自己的打单账户**
   ```
   用户调用 POST /api/lt/bind
   参数: openid=用户openid, shopName=打单账户, userKey=账户密钥
   ```

2. **用户在微信中发送物流地址**
   ```
   微信 → 服务 (POST /wechat with FromUserName)
   ```

3. **系统自动处理**
   ```
   a) 提取 openid → 查找用户绑定的打单账户
   b) 调用大模型解析地址
   c) 创建订单 → 记录关联的 openid
   d) 自动提交到用户绑定的打单平台账户
   e) 记录打单结果到 orders.json
   ```

4. **打单平台回调**
   ```
   灵通平台 → 回调 /api/lt/callback
   系统自动更新订单状态（已打单、已寄出等）
   ```

## 注意事项

- 仓库中不应包含真实密钥（`.env` 和 `wechat_users.json` 已被添加至 `.gitignore`）
- 微信返回的 `PicUrl` 可能是短期有效；此服务会尝试下载并以 dataURL 发送给模型以提高可靠性
- AI 返回的结果必须是严格 JSON。本项目在解析失败时会尝试抽取 JSON 片段或再次请求模型纠错
- 原始 AI 响应被记录到 `Logistics/logs/raw_ai_responses.log` 以便审计

## 下一步建议

- ✅ 微信用户账户绑定与自动提交
- ⏳ 增强多账户绑定时的用户选择流程（支持设置默认账户）
- ⏳ 集成 WeChat 客服接口，向用户反馈打单结果或错误
- ⏳ 将本地存储替换为轻量数据库（sqlite/lowdb），以便并发和持久化管理
- ⏳ 为完整的端到端流程编写集成测试（含微信回调模拟、模型输出模拟、打单 API 模拟）


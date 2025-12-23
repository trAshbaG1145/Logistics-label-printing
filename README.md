# Logistics-label-printing
基于微信服务号和大模型的物流打单系统

## 更新日志 (2025-12-23) - 查单功能与数据库迁移

本次更新主要实现了微信端自助查单功能，并将数据存储从本地文件迁移至 MySQL 数据库，以提升系统的稳定性和并发处理能力。

### 1. 核心功能更新
- **微信自助查单**：
  - 用户发送手机号（支持全号或后4位）或“查单+姓名”，即可查询最近订单。
  - 返回信息包含：收件人、手机号、发货状态、快递公司及单号。
  - 实现了意图识别拦截，查单请求不再消耗 AI Token。
- **数据库迁移**：
  - 引入 `mysql2` 模块，替代原有的 `orders.json` 和 `wechat_users.json` 文件存储。
  - 新增 `Logistics/db.js` 用于管理数据库连接池。
  - 实现了 `orders` 表和 `wechat_users` 表的读写分离与持久化。
- **回调处理增强**：
  - 优化 `/api/lt/callback` 接口，支持接收灵通打单平台的回调数据（发货/打印状态）。
  - 回调数据直接通过 SQL `UPDATE` 语句同步至数据库，实现单号实时更新。

### 2. 数据库结构变更
请在部署前执行以下 SQL 建表（详见 `查单功能完成流程.md`）：
- **orders 表**：存储订单详情、快递单号 (`express_no`)、状态 (`status`) 等。
- **wechat_users 表**：存储微信用户 OpenID 及灵通账户绑定关系 (`lt_bindings`)。

### 3. 代码结构与开发指南

#### 新增/修改的关键文件
- **`Logistics/db.js` (新增)**:
  - 封装了 `mysql2` 连接池。
  - **使用方式**: `import db from './db.js'; await db.execute('SELECT ...', [params]);`
  - **注意**: 默认配置了连接池大小为 10，开发时请注意释放连接（使用 `execute` 会自动释放）。

- **`Logistics/index.js` (修改)**:
  - **`processContent`**: 增加了正则匹配逻辑，优先拦截查单指令，未匹配才进入 AI 解析流程。
  - **`createOrderInDB` / `queryOrdersByContactDB`**: 封装了核心的 SQL 操作，后续新增业务逻辑请参考此类函数封装。
  - **`/api/lt/callback`**: 回调接口现在直接操作数据库，不再依赖内存中的 `orders` 数组。

#### 开发注意事项
1.  **异步操作**: 数据库操作均为异步，请务必使用 `async/await`，并包裹在 `try/catch` 中处理异常。
2.  **意图识别**: 如果需要新增其他指令（如“取消订单”），请在 `processContent` 函数顶部的正则匹配区域添加新的 `if` 分支。
3.  **微信回复**: 由于 AI 解析和数据库查询可能耗时，推荐使用 `sendWechatCustomMessage(openid, content)` 进行异步客服消息回复，而不是依赖 `res.send()`（微信要求 5s 内响应）。

### 4. 配置变更 (.env)
新增以下环境变量配置：
```ini
DB_HOST=127.0.0.1
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=logistics_db
DB_PORT=3306
```

### 5. 调试指南
- **查单测试**：在服务号发送下单手机号，验证是否返回订单卡片。
- **回调测试**：使用 `curl` 模拟 POST 请求至 `/api/lt/callback`，验证数据库状态更新。
  ```bash
  curl -X POST http://localhost:3001/api/lt/callback -H "Content-Type: application/json" -d '{"callbackType":"CONSIGNED","list":[{"tradeId":"<你的TRADE_ID>","expressNo":"SF123456","expressCompany":"顺丰"}]}'
  ```

### 6. 后续优化方向 (To-Do)
- [ ] **分页查询**: 目前查单仅返回最近 3 条，未来可增加分页或“查看更多”链接。
- [ ] **定时清理**: `orders` 表数据量增长后，需考虑归档或定期清理策略。
- [ ] **重试机制**: 微信回调或 AI 解析失败时的自动重试队列。

---


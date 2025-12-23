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

### 3. 配置变更 (.env)
新增以下环境变量配置：
```ini
DB_HOST=127.0.0.1
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=logistics_db
```

### 4. 调试指南
- **查单测试**：在服务号发送下单手机号，验证是否返回订单卡片。
- **回调测试**：使用 `curl` 模拟 POST 请求至 `/api/lt/callback`，验证数据库状态更新。

---


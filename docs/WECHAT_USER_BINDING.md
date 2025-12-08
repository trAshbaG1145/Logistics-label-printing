# 微信用户账户绑定 & 自动打单 - 设计文档

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          微信公众平台                                    │
└────────────────────┬────────────────────────────────────────────────────┘
                     │ POST /wechat (XML)
                     │ FromUserName: openid
                     │ Content/PicUrl: 物流信息
                     ▼
        ┌──────────────────────────────────┐
        │      Express 服务 (index.js)      │
        │                                  │
        │  1. 提取 openid (FromUserName)   │
        │  2. 调用 getOrCreateWechatUser() │
        │  3. 传递 wechatUser 给 processContent
        │  4. 在 processContent 中:       │
        │     - 调用 AI 解析地址            │
        │     - 查询用户绑定的 LT 账户     │
        │     - 用绑定账户提交订单         │
        └──────────────────────────────────┘
                     │
           ┌─────────┴─────────┬─────────────┐
           │                   │             │
           ▼                   ▼             ▼
    ┌────────────┐    ┌─────────────┐  ┌──────────────┐
    │ orders.json│    │wechat_users │  │ LT API       │
    │(订单存储)  │    │   .json     │  │(打单平台)    │
    │            │    │(用户绑定)   │  │              │
    └────────────┘    └─────────────┘  └──────────────┘
```

## 数据结构

### 1. 微信用户绑定数据 (wechat_users.json)

```json
[
  {
    "openid": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
    "nickname": "张三",
    "bindTime": "2025-12-08T10:00:00.000Z",
    "ltBindings": [
      {
        "shopName": "my_shop_001",
        "userKey": "ae08d4f008b7422abef5abdd9d8df116",
        "bindAt": "2025-12-08T10:00:00.000Z"
      },
      {
        "shopName": "my_shop_002",
        "userKey": "9f1b7c3e5a8d2f4b6c0e9a1d3f5b7c9e",
        "bindAt": "2025-12-08T11:30:00.000Z"
      }
    ]
  }
]
```

**说明：**
- `openid`: 微信用户唯一标识
- `nickname`: 用户昵称（可选，默认为 user_${openid的前8位}）
- `bindTime`: 用户首次创建时间
- `ltBindings`: 该用户绑定的所有打单账户列表
  - `shopName`: 打单平台的店铺名称
  - `userKey`: 打单平台提供的 API 密钥
  - `bindAt`: 该绑定的时间戳

### 2. 订单数据 (orders.json)

```json
[
  {
    "id": "1765194473511kq5se",
    "name": "张三",
    "phone": "13800138001",
    "province": "浙江省",
    "city": "杭州市",
    "district": "西湖区",
    "detail": "文一西路 88 号",
    "fullAddress": "浙江省杭州市西湖区文一西路 88 号",
    "source": "微信-文本",
    "createTime": "2025/12/8 19:47:53",
    "wechatUser": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",  // ✨ 新增：关联微信用户
    "printed": true,
    "printResponse": {
      "code": 0,
      "msg": "成功",
      "data": {
        "tradeId": "TRADE_1765194473554_0",
        "shopName": "my_shop_001",
        "orderNo": "2025120800001"
      }
    }
  }
]
```

**说明：**
- `wechatUser`: ✨ 新增字段，存储提交此订单的微信用户 openid
- 这样可以追踪哪个微信用户的订单被提交到了哪个账户

## API 接口

### 1. 绑定账户

**请求：**
```bash
POST /api/lt/bind
Content-Type: application/json

{
  "openid": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
  "shopName": "my_shop_001",
  "userKey": "ae08d4f008b7422abef5abdd9d8df116"
}
```

**响应：**
```json
{
  "code": 0,
  "msg": "绑定成功",
  "data": {
    "openid": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
    "nickname": "user_oDqbY5NY",
    "bindTime": "2025-12-08T10:00:00.000Z",
    "ltBindings": [
      {
        "shopName": "my_shop_001",
        "userKey": "ae08d4f008b7422abef5abdd9d8df116",
        "bindAt": "2025-12-08T10:00:00.000Z"
      }
    ]
  }
}
```

### 2. 查询绑定

**请求：**
```bash
GET /api/lt/accounts/:openid
```

**响应：**
```json
{
  "code": 0,
  "msg": "查询成功",
  "data": {
    "openid": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
    "nickname": "张三",
    "bindTime": "2025-12-08T10:00:00.000Z",
    "ltBindings": [
      {
        "shopName": "my_shop_001",
        "userKey": "ae08d4f008b7422abef5abdd9d8df116",
        "bindAt": "2025-12-08T10:00:00.000Z"
      },
      {
        "shopName": "my_shop_002",
        "userKey": "9f1b7c3e5a8d2f4b6c0e9a1d3f5b7c9e",
        "bindAt": "2025-12-08T11:30:00.000Z"
      }
    ]
  }
}
```

### 3. 解绑账户

**请求：**
```bash
POST /api/lt/unbind
Content-Type: application/json

{
  "openid": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
  "shopName": "my_shop_002"
}
```

**响应：**
```json
{
  "code": 0,
  "msg": "解绑成功",
  "data": {
    "openid": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
    "ltBindings": [
      {
        "shopName": "my_shop_001",
        "userKey": "ae08d4f008b7422abef5abdd9d8df116",
        "bindAt": "2025-12-08T10:00:00.000Z"
      }
    ]
  }
}
```

## 核心代码逻辑

### 1. 微信消息接收

```javascript
app.post('/wechat', async (req, res) => {
    const message = result.xml;
    
    // ✨ 新增：提取微信用户 openid
    const wechatUser = getOrCreateWechatUser(message.FromUserName);
    
    // 传递 wechatUser 给处理函数
    if (message.MsgType === 'text') {
        processContent(message.Content, 'text', wechatUser);
    }
});
```

### 2. 获取或创建微信用户

```javascript
const getOrCreateWechatUser = (openid, nickname = '') => {
    let user = wechatUsers.find(u => u.openid === openid);
    if (!user) {
        user = {
            openid,
            nickname: nickname || `user_${openid.substring(0, 8)}`,
            bindTime: new Date().toISOString(),
            ltBindings: []
        };
        wechatUsers.push(user);
        saveWechatUsers();
    }
    return user;
};
```

### 3. 订单提交时使用绑定账户

```javascript
// 在 processContent 中
if (wechatUser && wechatUser.ltBindings && wechatUser.ltBindings.length > 0) {
    const binding = wechatUser.ltBindings[0];  // 使用第一个绑定账户
    const printOpts = {
        shopName: binding.shopName,
        userKey: binding.userKey
    };
    const printResult = await sendToPrinter(newOrder, printOpts);
}
```

## 工作流完整示例

### 场景：微信用户张三发送物流信息

**时序图：**
```
张三的微信              我们的服务              LT 打单平台
   │                      │                       │
   │─ 发送地址 ──────────>│                       │
   │  (FromUserName)       │                       │
   │                       │ 1. 提取 openid       │
   │                       │ 2. 查找绑定的账户    │
   │                       │ 3. AI 解析地址      │
   │                       │ 4. 使用绑定账户     │
   │                       │────────────────────>│
   │                       │    sendOrder()       │
   │                       │    {shopName, userKey}
   │                       │<────────────────────│
   │                       │    返回 tradeId      │
   │                       │ 5. 保存到 orders.json
   │<── success ───────────│                      │
   │
   │ (后续)
   │ 包裹已打单、已寄出
   │                       │<─── 回调 ────────────│
   │                       │  /api/lt/callback    │
   │                       │ 6. 更新订单状态      │
```

**步骤详解：**

1. **微信消息到达**
   ```
   POST /wechat
   FromUserName: oDqbY5NYZMeKNLDKh0LJt4rF5sXQ (张三的 openid)
   Content: "浙江省杭州市西湖区文一西路88号，收件人：张三，电话13800138001"
   ```

2. **服务提取 openid**
   ```javascript
   const wechatUser = getOrCreateWechatUser("oDqbY5NYZMeKNLDKh0LJt4rF5sXQ");
   // 返回: {openid, nickname, bindTime, ltBindings: [...]}
   ```

3. **调用 processContent 时传递用户信息**
   ```javascript
   processContent(message.Content, 'text', wechatUser);
   ```

4. **在 processContent 中使用绑定账户**
   ```javascript
   // 从 wechatUser 获取第一个绑定账户
   const binding = wechatUser.ltBindings[0];
   
   // 提交订单时带上账户信息
   await sendToPrinter(newOrder, {
       shopName: binding.shopName,
       userKey: binding.userKey
   });
   ```

5. **订单被关联到微信用户**
   ```json
   {
     "id": "...",
     "name": "张三",
     "wechatUser": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
     "printed": true,
     "printResponse": { ... }
   }
   ```

## 安全考虑

### 1. 密钥存储
- ❌ **不安全**：在代码中硬编码 userKey
- ✅ **安全**：存储在 gitignored 的 `wechat_users.json` 中
- 🔒 **更安全**：使用加密存储（建议生产环境升级为数据库 + 字段加密）

### 2. 认证与授权
- 微信 openid 是用户的唯一标识，通过微信服务号验证（`GET /wechat` 签名校验）
- 绑定操作应添加额外验证（e.g., 用户需通过微信菜单或链接主动发起绑定请求）
- 建议添加 token/session 机制确保只有授权用户能修改自己的绑定

### 3. 隐私
- 订单数据中的 `wechatUser` 字段可用于追踪用户，建议只在必要时暴露给管理员

## 未来改进

### 短期
- [ ] UI 界面：在微信中提供绑定/解绑账户的菜单
- [ ] 多账户选择：当用户有多个绑定账户时，支持用户主动选择
- [ ] 错误提示：订单提交失败时向用户反馈（如通过客服消息）

### 中期
- [ ] 数据库升级：从 JSON 文件迁移到 SQLite/MongoDB，支持并发和查询
- [ ] 字段加密：对 userKey 等敏感信息进行加密存储
- [ ] 审计日志：记录所有账户绑定/提交操作，便于追踪

### 长期
- [ ] OAuth2 流程：支持通过打单平台官方 OAuth 授权而非手动输入 userKey
- [ ] 事件驱动：使用消息队列（RabbitMQ/Kafka）处理订单提交和回调
- [ ] 多租户：支持多个公众号/企业账户使用同一服务

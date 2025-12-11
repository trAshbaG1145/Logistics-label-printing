# 微信用户自动创建店铺功能

## 概述

系统支持为微信用户自动创建灵通(LT)打单店铺。当用户首次发送地址信息时,系统会:
1. 自动创建一个 LT 打单店铺
2. 将店铺与微信用户绑定
3. 获取并发送登录链接给用户

## 功能特性

- ✅ 自动识别微信用户(通过 openid)
- ✅ 智能判断地址类型(发件人/收件人)
- ✅ 自动创建并绑定 LT 店铺
- ✅ 通过客服消息发送登录链接
- ✅ 记录创建历史到审计日志

## 配置说明

在 `.env` 文件中配置以下环境变量:

```env
# 自动创建店铺开关 (true/false)
LT_AUTO_CREATE=true

# 店铺名称前缀
LT_SHOP_NAME_PREFIX=wx

# 默认发件人信息(当用户发送的是收件人地址时使用)
LT_DEFAULT_SENDER_NAME=默认发件人
LT_DEFAULT_SENDER_PROVINCE=浙江省
LT_DEFAULT_SENDER_CITY=杭州市
LT_DEFAULT_SENDER_DISTRICT=西湖区
LT_DEFAULT_SENDER_DETAIL=文一西路88号
LT_DEFAULT_SENDER_MOBILE=13800138000

# LT 登录页面 URL (可选,用于切换测试/生产环境)
LT_LOGIN_BASE_URL=https://lt.800best.com/smart/h5/index.html

# 微信配置(用于发送客服消息)
WECHAT_APPID=your_appid
WECHAT_APPSECRET=your_appsecret
```

## 工作流程

```
用户发送地址信息到微信
    ↓
系统解析地址内容
    ↓
检测是否为发件人信息
(关键词: 发件人、寄件人、发货地址等)
    ↓
判断用户是否已绑定店铺
    ↓
[未绑定] 自动创建店铺
├─ 使用解析的地址(发件人) 或 默认地址(收件人)
├─ 生成店铺名: {prefix}_{nickname}_{timestamp}
├─ 调用 LT API 创建店铺
└─ 获取 userKey
    ↓
绑定店铺到微信用户
├─ 保存到 wechat_users.json
└─ 记录到 lt_created_users.json (审计日志)
    ↓
获取 LT 登录 URL
    ↓
通过微信客服消息发送给用户
```

## 数据结构

### 微信用户绑定 (wechat_users.json)
```json
{
  "openid": "weixin_user_openid",
  "nickname": "用户昵称",
  "bindTime": "2025-12-11T10:00:00.000Z",
  "ltBindings": [
    {
      "shopName": "wx_user_1234",
      "userKey": "ae08d4f008b7422abef5abdd9d8df116",
      "bindAt": "2025-12-11T10:00:00.000Z"
    }
  ]
}
```

### 创建审计日志 (lt_created_users.json)
```json
[
  {
    "shopName": "wx_user_1234",
    "userKey": "ae08d4f008b7422abef5abdd9d8df116",
    "openid": "weixin_user_openid",
    "createdAt": "2025-12-11T10:00:00.000Z"
  }
]
```

## 地址类型识别

系统使用关键词检测判断地址类型:

**发件人信息关键词:**
- 发件人
- 寄件人
- 寄件地址
- 发货地址
- 寄出地址

如果文本中包含这些关键词,解析出的地址将作为店铺的发件人信息;
否则,系统认为是收件人地址,使用环境变量中配置的默认发件人信息。

## API 端点

虽然主要是自动化流程,但系统也保留了手动绑定的 API:

### 查询用户绑定
```bash
GET /api/lt/accounts/:openid
```

### 手动绑定(高级用户)
```bash
POST /api/lt/bind
Content-Type: application/json

{
  "openid": "用户openid",
  "shopName": "店铺名称",
  "userKey": "API密钥"
}
```

## 安全考虑

- ✅ 敏感数据存储在 gitignored 文件中
- ✅ 每个微信用户只能创建一次店铺(首次发送时)
- ✅ 创建记录保存到审计日志
- ⚠️ userKey 未加密存储(建议生产环境升级为数据库+加密)
- ⚠️ 需要配置有效的手机号(LT 要求)

## 测试

1. 确保环境变量已配置
2. 设置 `LT_AUTO_CREATE=true`
3. 在微信中发送地址信息:
   ```
   张三 13800138000
   浙江省杭州市西湖区文一西路88号
   ```
4. 系统会自动创建店铺并回复登录链接

## 故障排查

### 问题: 没有自动创建店铺
- 检查 `LT_AUTO_CREATE` 是否设置为 `true`
- 检查用户是否已有绑定店铺(系统不会重复创建)
- 查看日志中是否有错误信息

### 问题: 创建失败
- 确认 LT_APP_ID 和 LT_APP_KEY 配置正确
- 确认提供了有效的手机号
- 检查 LT API 是否可访问

### 问题: 没有收到登录链接
- 确认 WECHAT_APPID 和 WECHAT_APPSECRET 配置正确
- 检查微信客服消息功能是否启用
- 查看日志中的客服消息发送结果

## 与旧文档的关系

本功能**替代**了之前的 OAuth 绑定流程。旧文档提到的功能:
- ❌ OAuth 授权登录流程 → 已移除
- ❌ 手动绑定为主流程 → 已改为自动创建
- ✅ 数据结构保持兼容
- ✅ 手动绑定 API 仍可用(用于高级场景)

## 相关文件

- `Logistics/index.js` - 主要实现逻辑
- `Logistics/services/printerAdapters/lt.js` - LT API 封装
- `Logistics/wechat_users.json` - 用户绑定数据
- `Logistics/lt_created_users.json` - 创建审计日志
- `Logistics/.env.example` - 配置示例

## 下一步改进建议

1. 添加创建确认流程(用户确认后再创建)
2. 支持修改默认发件人信息的界面
3. 数据库迁移(替代 JSON 文件)
4. 加密存储 userKey
5. 添加创建限流(防滥用)

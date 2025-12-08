# 快速开始：微信用户账户绑定

## 场景

用户是微信服务号的订阅用户，想要：
1. 在微信中一键绑定自己的打单平台（灵通）账户
2. 之后在微信中发送物流信息，系统自动解析并提交到自己的打单平台账户
3. 打单平台处理完成后，订单状态自动回传

## 前置条件

1. 已部署本服务到服务器（参考 Logistics/README.md）
2. 已在微信公众平台配置服务器 URL 和 token
3. 已获取灵通打单平台的 API 凭证（LT_APP_ID, LT_TOKEN）

## 三步集成

### 第一步：准备微信菜单（可选但推荐）

在微信公众平台创建自定义菜单，提供绑定链接：

```
菜单1: 账户管理
  - 绑定打单账户
  - 查看已绑定账户
  - 解绑账户
```

链接指向你的 Web 页面（H5 页面），页面通过微信 JS SDK 获取 openid，然后调用绑定 API。

### 第二步：用户绑定打单账户

**方式A：通过 API 直接调用（后端调用）**

用户在微信中填写表单后，你的后端调用：

```bash
curl -X POST https://your-domain.com/api/lt/bind \
  -H "Content-Type: application/json" \
  -d '{
    "openid": "用户的微信openid",
    "shopName": "用户的打单平台店铺名",
    "userKey": "用户的打单平台API密钥"
  }'
```

**响应示例：**
```json
{
  "code": 0,
  "msg": "绑定成功",
  "data": {
    "openid": "oDqbY5NYZMeKNLDKh0LJt4rF5sXQ",
    "ltBindings": [
      {
        "shopName": "my_shop_001",
        "userKey": "xxx",
        "bindAt": "2025-12-08T10:00:00.000Z"
      }
    ]
  }
}
```

**方式B：通过微信自定义菜单链接（用户自助）**

创建一个 Web 页面（H5），包含绑定表单：
- 使用 WeChat JS SDK 获取 openid
- 用户填入 shopName 和 userKey
- 点击提交时调用上述 API

```html
<!-- 简化示例 -->
<form id="bindForm">
  <input type="text" name="shopName" placeholder="打单平台店铺名">
  <input type="password" name="userKey" placeholder="API密钥">
  <button type="submit">绑定</button>
</form>

<script>
wx.ready(function() {
  // 获取 openid
  fetch('/api/get-openid').then(r => r.json()).then(data => {
    window.openid = data.openid;
  });
});

document.getElementById('bindForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const res = await fetch('/api/lt/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      openid: window.openid,
      shopName: formData.get('shopName'),
      userKey: formData.get('userKey')
    })
  });
  const result = await res.json();
  alert(result.msg);
});
</script>
```

### 第三步：验证绑定并发送测试订单

1. **验证绑定**
```bash
curl https://your-domain.com/api/lt/accounts/用户的openid
```

应返回用户的所有已绑定账户。

2. **发送测试物流信息到微信**

用户在微信中发送：
```
收件人：李四
电话：13800138002
省份：江苏省
城市：南京市
区：玄武区
地址：中山路100号
```

3. **验证订单是否自动提交**

调用查询 API：
```bash
curl https://your-domain.com/api/orders
```

查看最新订单，应该包含：
- `wechatUser`: 用户的 openid
- `printed`: true
- `printResponse`: 打单平台的返回信息（包含 tradeId）

## 完整示例代码

### Node.js 后端集成示例

```javascript
// 假设你有一个微信消息处理的中间件

import axios from 'axios';

// 用户点击菜单 -> 打开 H5 页面 -> 提交绑定表单
app.post('/user/bind-printer', async (req, res) => {
  const { openid, shopName, userKey } = req.body;
  
  try {
    const bindRes = await axios.post('http://localhost:3001/api/lt/bind', {
      openid,
      shopName,
      userKey
    });
    
    if (bindRes.data.code === 0) {
      // 绑定成功，可以发送微信消息通知用户
      res.json({ success: true, msg: '账户已绑定' });
    } else {
      res.json({ success: false, msg: bindRes.data.msg });
    }
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// 用户查询已绑定账户
app.get('/user/printer-accounts', async (req, res) => {
  const { openid } = req.query;
  
  try {
    const accountRes = await axios.get(`http://localhost:3001/api/lt/accounts/${openid}`);
    res.json(accountRes.data);
  } catch (err) {
    res.status(500).json({ code: 1, msg: err.message });
  }
});

// 用户解绑账户
app.post('/user/unbind-printer', async (req, res) => {
  const { openid, shopName } = req.body;
  
  try {
    const unbindRes = await axios.post('http://localhost:3001/api/lt/unbind', {
      openid,
      shopName
    });
    res.json(unbindRes.data);
  } catch (err) {
    res.status(500).json({ code: 1, msg: err.message });
  }
});
```

### 微信客服消息通知

绑定成功后，可以通过微信客服接口向用户推送一条确认消息：

```javascript
const sendWechatNotification = async (openid, msg) => {
  const accessToken = await getWechatAccessToken();
  
  await axios.post(
    `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`,
    {
      touser: openid,
      msgtype: 'text',
      text: { content: msg }
    }
  );
};

// 在绑定成功后调用
sendWechatNotification(openid, `✓ 已成功绑定打单账户 ${shopName}，后续发送的物流信息将自动提交到此账户`);
```

## 测试

运行内置测试来验证整个流程：

```bash
cd Logistics
npm test
node test/test_wechat_user_binding.js
```

输出应该显示：
- ✓ 微信用户已绑定
- ✓ 已创建订单，已自动提交到用户绑定的 LT 账户
- ✓ 已添加第二个绑定账户（测试多账户）

## 故障排查

| 问题 | 原因 | 解决方案 |
|------|------|--------|
| POST /api/lt/bind 返回 400 | 缺少必需参数 | 确保提供 openid, shopName, userKey |
| 订单未自动提交到 LT | 用户未绑定账户 或 LT 凭证错误 | 检查 wechat_users.json 和 .env 中的 LT_APP_ID/LT_TOKEN |
| 收到 "用户认证信息错误" | shopName/userKey 无效 | 验证用户输入的 shopName 和 userKey 是否正确 |
| orders.json 中 wechatUser 为 null | 微信消息中未提取 FromUserName | 检查 index.js 中是否正确解析 XML 中的 FromUserName |

## 下一步

- [ ] 部署到生产环境
- [ ] 创建微信菜单和 H5 绑定页面
- [ ] 集成微信客服 API 发送确认消息
- [ ] 监控并处理打单平台回调
- [ ] 建立数据库备份策略

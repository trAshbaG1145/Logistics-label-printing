### 请求地址

| 环境名称 | 请求地址                           |
| :------- | :--------------------------------- |
| 正式环境 | https://ltopen.800best.com/api/v1/ |

说明：创建成功用户后，测试环境从http://lttest.800best.com登录，生产环境从http://lt.800best.com登录

### 公共请求参数

| 名称      | 类型   | 必须 | 描述                                                         |
| :-------- | :----- | :--- | :----------------------------------------------------------- |
| appId     | Long   | 是   | 平台ID                                                       |
| timestamp | String | 是   | 当前请求的时间戳，精确到毫秒。时间戳允许相差10分钟           |
| appSign   | String | 是   | 按照规则(md5(appID + timestamp + appKey + data))生成的验证合法性签名。某些API不需要data，用空字符串替代。 |
| data      | String | 是   | Json格式的数据                                               |

### 公共响应参数

| 名称 | 类型   | 必须 | 描述                         |
| :--- | :----- | :--- | :--------------------------- |
| code | int    | 是   | 响应状态码。0-成功，非0-失败 |
| msg  | String | 是   | 结果的详细说明               |
| data | String | 是   | Json格式的数据               |

说明：需要在请求的头部加入：Content-Type: application/x-www-form-urlencoded，公共参数以Key-Value的形式传参，data为Json格式的业务内容

#### Java代码示例：

```
    public void test() {
        Map<String, String> params = new HashMap<>();
        String timestamp = String.valueOf(System.currentTimeMillis());
        String appId = "123456";
        String appKey = "fasfkewf930mjsekaowefj";
        String data = "{}";
        String sign = MD5(appId, timestamp, appKey, data);
        params.put("appId", appId);
        params.put("timestamp", timestamp);
        params.put("appSign", sign);
        params.put("data", data);
        String response = HttpPostUtil.doPost("http://lttest.800best.com/api/v1/users/create", params);
    }
```

### 错误码

| 错误码 | 描述                                                |
| :----- | :-------------------------------------------------- |
| 100001 | 业务参数有误                                        |
| 100002 | 请求方式错误                                        |
| 100003 | 请求数据格式错误                                    |
| 100004 | 请求类型不合法                                      |
| 100005 | 认证信息失败                                        |
| 100006 | API调用次数已经达到上限，请联系管理员认证已提高次数 |

### 新建用户

Http请求方式和地址：POST /users/create

#### 请求参数

| 名称        | 类型   | 必须 | 描述                                                 |
| :---------- | :----- | :--- | :--------------------------------------------------- |
| shopName    | String | 是   | 店铺名                                               |
| password    | String |      | 用户密码（8~20位），如果不传灵通将会生成一个随机密码 |
| contactName | String | 是   | 发件人姓名                                           |
| province    | String | 是   | 发件人省                                             |
| city        | String | 是   | 发件人市                                             |
| country     | String | 是   | 发件人区                                             |
| detailAddr  | String | 是   | 发件人详细地址                                       |
| phone       | String |      | 发件人电话                                           |
| mobile      | String | 是   | 发件人手机                                           |

#### 返回参数

| 名称      | 类型   | 必须 | 描述                                                         |
| :-------- | :----- | :--- | :----------------------------------------------------------- |
| shopName  | String | 是   | 店铺名                                                       |
| loginName | String | 是   | 登录用户名，由灵通系统生成，用户可以用该用户名和初始密码登录灵通 |
| password  | String | 是   | 如果请求参数不传用户密码，灵通将会生成一个默认初始密码       |
| userKey   | String | 是   | 灵通系统生成的用户Key，API调用时使用                         |

说明：

1、shopName是用户的唯一标识符，不能重复。登录名由灵通生成，可以通过登录名+初始密码在灵通系统中登录。为提高安全性，用户Key后期将开放给用户可重置。password只在创建成功的时候返回。
2、登录用户名的生成规则：平台_shopName，平台名由对接前可设置（设置界面开发中，暂时可以通过发给开发人员设置），建议使用名字缩写。

#### 请求示例

```
{
  "shopName": "果er美",
  "password": "A@abc12345",
  "contactName": "向",
  "province": "浙江省",
  "city": "杭州市",
  "country": "西湖区",
  "detailAddr": "详细地址",
  "phone": "123-09678987",
  "mobile": "12345678987"
}
```

#### 返回示例

```
{
  "code": 0,
  "msg": "成功",
  "data": {
    "shopName": "果er美",
    "password": "abc12345",
    "userKey": "4795d7d2e27e45c3823c79f33c67acbc",
    "loginName": "bbc_果er美"
  }
}
```

### 更新用户资料

Http请求方式和地址：POST /users/update

#### 请求参数

| 名称        | 类型   | 必须 | 描述               |
| :---------- | :----- | :--- | :----------------- |
| shopName    | String | 是   | 店铺名             |
| password    | String |      | 密码，密码只能重置 |
| contactName | String |      | 发件人姓名         |
| province    | String |      | 发件人省           |
| city        | String |      | 发件人市           |
| country     | String |      | 发件人区           |
| detailAddr  | String |      | 发件人详细地址     |
| phone       | String |      | 发件人电话         |
| mobile      | String |      | 发件人手机         |

#### 返回参数

| 名称     | 类型   | 必须 | 描述   |
| :------- | :----- | :--- | :----- |
| shopName | String | 是   | 店铺名 |

#### 请求示例

```
{
  "shopName": "果er美",
  "password": "abc123",
  "contactName": "向",
  "province": "浙江省",
  "city": "杭州市",
  "country": "西湖区",
  "detailAddr": "详细地址",
  "phone": "123-09678987",
  "mobile": "12345678987"
}
```

#### 返回示例

```
{
  "code": 0,
  "msg": "成功",
  "data": "果er美"
}
```

### 查看用户资料

Http请求方式和地址：POST /users/get

#### 请求参数

| 名称     | 类型   | 必须 | 描述   |
| :------- | :----- | :--- | :----- |
| shopName | String | 是   | 店铺名 |

#### 返回参数

| 名称        | 类型   | 必须 | 描述                                                         |
| :---------- | :----- | :--- | :----------------------------------------------------------- |
| shopName    | String | 是   | 店铺名                                                       |
| loginName   | String | 是   | 登录用户名，由灵通系统生成，用户可以用该用户名和初始密码登录灵通 |
| userKey     | String | 是   | 灵通系统生成的用户Key，API调用时使用                         |
| contactName | String |      | 发件人姓名                                                   |
| province    | String |      | 发件人省                                                     |
| city        | String |      | 发件人市                                                     |
| country     | String |      | 发件人区                                                     |
| detailAddr  | String |      | 发件人详细地址                                               |
| phone       | String |      | 发件人电话                                                   |
| mobile      | String |      | 发件人手机                                                   |

#### 请求示例

```
{
  "shopName": "果er美"
}
```

#### 返回示例

```
{
  "code": 0,
  "msg": "成功",
  "data": {
    "shopName": "果er美",
    "userKey": "4795d7d2e27e45c3823c79f33c67acbc",
    "contactName": "向",
    "province": "浙江省",
    "city": "杭州市",
    "country": "西湖区",
    "phone": "123-09678987",
    "mobile": "12345678987",
    "loginName": "bbc_果er美",
    "detailAddr": "详细地址"
  }
}
```

### 用户登录

Http请求方式和地址：POST /users/login/url

#### 请求参数

| 名称      | 类型   | 必须 | 描述                                                         |
| :-------- | :----- | :--- | :----------------------------------------------------------- |
| user      | {}     |      |                                                              |
| shopName  | String | 是   | 店铺名                                                       |
| timestamp | String | 是   | 当前时间戳                                                   |
| userSign  | String | 是   | 按照规则(md5(shopName + timestamp + userKey))生成的验证合法性签名 |

#### 返回参数

| 名称 | 类型   | 必须 | 描述    |
| :--- | :----- | :--- | :------ |
| url  | String | 是   | 登录URL |

#### 请求示例

```
{
  "user": {
    "shopName": "果小美",
    "timestamp": "1527909832028",
    "userSign": "dfb39f93a70cf876a8e94df1305f1553"
  }
}
```

#### 返回示例

```
{
  "code": 0,
  "msg": "成功",
  "data": "http://lttest.800best.com/smart/h5/index.html?uid=12445960&token=H3jrn6huX7LDTRB&server=http://lttest.800best.com"
}
```

### 错误码

| 错误码 | 描述                                                         |
| :----- | :----------------------------------------------------------- |
| 200001 | 用户已存在                                                   |
| 200002 | 用户认证信息错误或者用户不存在                               |
| 200003 | 用户不存在                                                   |
| 200004 | 可创建用户数已达到上限，请联系管理员认证                     |
| 200005 | 开放平台用户的“平台简称”还未填写，请先到开放平台填写平台简称 |

### 订单创建

Http请求方式和地址：POST /trades/create

#### 请求参数

| 名称              | 类型   | 必须 | 描述                                                         |
| :---------------- | :----- | :--- | :----------------------------------------------------------- |
| user              | {}     |      |                                                              |
| shopName          | String | 是   | 店铺名                                                       |
| timestamp         | String | 是   | 当前时间戳                                                   |
| userSign          | String | 是   | 按照规则(md5(shopName + timestamp + userKey))生成的验证合法性签名 |
| trades            | []     |      |                                                              |
| tradeId           | String | 是   | 订单ID，平台应该具有唯一性                                   |
| modified          | Long   | 是   | 订单最新修改的时间戳                                         |
| payTime           | Long   | 是   | 订单付款的时间戳                                             |
| status            | String | 是   | 订单状态，具体查看订单状态列表                               |
| receiverName      | String | 是   | 收件人姓名                                                   |
| receiverState     | String | 是   | 收件人省                                                     |
| receiverCity      | String | 是   | 收件人市                                                     |
| receiverDistrict  | String | 是   | 收件人区                                                     |
| receiverAddress   | String | 是   | 收件人详细地址                                               |
| receiverPhone     | String | 是   | 收件人电话                                                   |
| receiverMobile    | String | 是   | 收件人手机，手机、电话必填一个                               |
| payment           | String |      | 订单总金额                                                   |
| postFee           | String |      | 邮费                                                         |
| buyerNick         | String |      | 买家昵称，不填将默认采用收件人                               |
| buyerMessage      | String |      | 买家留言                                                     |
| sellerNick        | String |      | 卖家昵称                                                     |
| sellerMemo        | String |      | 卖家备注                                                     |
| orders            | []     |      |                                                              |
| orderId           | String |      | 商品ID，兼容唯一ID是String的情况                             |
| price             | String |      | 单价                                                         |
| totalFee          | String |      | 总价                                                         |
| num               | int    | 是   | 数量                                                         |
| itemWeight        | String |      | 重量                                                         |
| refundStatus      | String |      | 订单商品的退款状态，值：WAIT_SELLER_AGREE，SUCCESS，REFUND_CLOSED。分别是退款中，退款完成，退款关闭 |
| numIid            | Long   |      | 外部系统，商品数字id，建议传，不传的话根据商品进行的操作（备货单等）可能会异常 |
| title             | String | 是   | 商品标题                                                     |
| skuPropertiesName | String |      | 商品颜色、规格等，不同的规格间用空格隔开，如：颜色:黑色 尺码:可调节 |
| picPath           | String |      | 商品缩略图地址                                               |

#### 返回参数

| 名称 | 类型 | 必须 | 描述 |
| :--- | :--- | :--- | :--- |
|      |      |      |      |

暂无数据

说明：

订单状态更新也可以使用该接口，允许多次重复推送。但当灵通订单状态处于已发货时将不会更新订单。每次推送订单建议不超过100条。

#### 请求示例

```
{
  "user": {
    "shopName": "果er美",
    "timestamp": "1527909832028",
    "userSign": "dfb39f93a70cf876a8e94df1305f1553"
  },
  "trades": [
    {
      "modified": 1527254929000,
      "payTime": 1527254929000,
      "buyerMessage": "梦测试",
      "receiverName": "马浩2",
      "receiverState": "安徽省",
      "receiverCity": "宿州市",
      "receiverDistrict": "埇桥区",
      "receiverAddress": "三八街道宿州市中山公园",
      "receiverPhone": "0571-38789987",
      "receiverMobile": "11155728626",
      "buyerNick": "糖果眩甜",
      "sellerNick": "远虹食品经营部",
      "payment": "50.0",
      "postFee": "0",
      "status": "WAIT_SELLER_SEND_GOODS",
      "tradeId": "165689439853306934",
      "orders": [
        {
          "orderId": "165689439853306940",
          "price": "50.0",
          "totalFee": "50.0",
          "num": 1,
          "itemWeight": "10",
          "numIid": 569016422743,
          "title": "大片手撕风干牛肉干高原黄牛片牛肉干手撕蜜汁牛肉干230g*2罐零食",
          "skuPropertiesName": "包装规格:230g*2罐（酱香味） ",
          "picPath": "http://cbu01.alicdn.com/img/order/trading/439/603/358934986561/8833540348_2084911414.80x80.jpg"
        }
      ]
    },
    {
      "modified": 1527254929000,
      "payTime": 1527254929000,
      "buyerMessage": "唐梦鸿备注",
      "receiverName": "马荣浩",
      "receiverState": "安徽省",
      "receiverCity": "宿州市",
      "receiverDistrict": "埇桥区",
      "receiverAddress": "三八街道宿州市中山公园",
      "receiverPhone": "0571-38789987",
      "receiverMobile": "18155728616",
      "buyerNick": "糖果眩甜",
      "sellerNick": "远虹食品经营部",
      "payment": "50.0",
      "postFee": "0",
      "status": "WAIT_SELLER_SEND_GOODS",
      "tradeId": "165689439853306935",
      "orders": [
        {
          "orderId": "165689439853306940",
          "price": "50.0",
          "totalFee": "50.0",
          "num": 1,
          "numIid": 569016422743,
          "title": "大片手撕风干牛肉干高原黄牛片牛肉干手撕蜜汁牛肉干230g*2罐零食",
          "skuPropertiesName": "包装规格:230g*2罐（酱香味） ",
          "picPath": "http://cbu01.alicdn.com/img/order/trading/439/603/358934986561/8833540348_2084911414.80x80.jpg"
        }
      ]
    }
  ]
}
```

#### 返回示例

```
{
  "code": 0,
  "msg": "成功",
  "data": 2
}
```

### 订单搜索

Http请求方式和地址：POST /trades/search

#### 请求参数

| 名称               | 类型   | 必须 | 描述                                                         |
| :----------------- | :----- | :--- | :----------------------------------------------------------- |
| user               | {}     |      |                                                              |
| shopName           | String | 是   | 店铺名                                                       |
| timestamp          | String | 是   | 当前时间戳                                                   |
| userSign           | String | 是   | 按照规则(md5(shopName + timestamp + userKey))生成的验证合法性签名 |
| tradeId            | String |      | 订单号                                                       |
| lastUpdateTimeFrom | Long   |      | 起始修改时间                                                 |
| lastUpdateTimeTo   | Long   |      | 结束修改时间                                                 |
| consignTimeFrom    | Long   |      | 起始发货时间                                                 |
| consignTimeEnd     | Long   |      | 结束发货时间                                                 |
| status             | String | 是   | 订单状态，具体查看订单状态列表                               |
| pageNumber         | int    |      | 当前页码，从1开始                                            |
| objectsPerPage     | int    |      | 每页条数（1~200条）                                          |

#### 返回参数

| 名称           | 类型   | 必须 | 描述                                   |
| :------------- | :----- | :--- | :------------------------------------- |
| fullListSize   | int    | 是   | 总共条数                               |
| pageNumber     | int    | 是   | 当前页码                               |
| objectsPerPage | int    | 是   | 每页记录数                             |
| list           | []     |      |                                        |
| tradeId        | String | 是   | 订单ID，平台应该具有唯一性             |
| lastUpdateTime | Date   | 是   | 订单最新修改的时间戳                   |
| status         | String | 是   | 订单状态，具体查看订单状态列表         |
| consignTime    | Date   |      | 发货时间                               |
| expressCompany | String |      | 快递公司编码，具体查看快递公司映射列表 |
| expressNo      | String |      | 单号                                   |

#### 请求示例

```
{
  "user": {
    "shopName": "果er美",
    "timestamp": "1527909832028",
    "userSign": "dfb39f93a70cf876a8e94df1305f1553"
  },
  "objectsPerPage": 1,
  "status": "WAIT_SELLER_SEND_GOODS"
}
```

#### 返回示例

```
{
  "code": 0,
  "msg": "成功",
  "data": {
    "list": [
      {
        "tradeId": "165689439853306934",
        "lastUpdateTime": 1528116620000,
        "status": "WAIT_SELLER_SEND_GOODS",
        "expressNo": ""
      }
    ],
    "fullListSize": 2,
    "pageNumber": 1,
    "objectsPerPage": 1
  }
}
```

### 订单状态

| 标识                     | 意义             | 描述                       |
| :----------------------- | :--------------- | :------------------------- |
| WAIT_BUYER_PAY           | 等待买家付款     | 交易刚创建                 |
| WAIT_SELLER_SEND_GOODS   | 等待卖家发货     | 买家已付款，可以打印发货了 |
| SELLER_CONSIGNED_PART    | 等待买家付款     | 卖家部分发货               |
| WAIT_BUYER_CONFIRM_GOODS | 等待买家确认收货 | 发货之后的状态             |
| TRADE_BUYER_SIGNED       | 买家已签收       | 等待买家付款               |
| TRADE_FINISHED           | 交易成功，关闭等 | 等待买家付款               |

### 错误码

| 错误码 | 描述         |
| :----- | :----------- |
| 300001 | 订单数据有误 |

### 获取快递公司映射列表

Http请求方式和地址：POST /logistics/company/get

#### 请求参数

| 名称 | 类型 | 必须 | 描述 |
| :--- | :--- | :--- | :--- |
|      |      |      |      |

暂无数据

#### 返回参数

| 名称      | 类型   | 必须 | 描述         |
| :-------- | :----- | :--- | :----------- |
| companies | []     |      |              |
| code      | String | 是   | 快递公司代码 |
| name      | String | 是   | 快递公司名字 |
| shortName | String | 是   | 快递公司简称 |

#### 请求示例

暂无

#### 返回示例

```
{
  "code": 0,
  "msg": "成功",
  "data": {
    "companies": [
      {
        "code": "POST",
        "name": "中国邮政-平邮",
        "shortName": "平邮"
      },
      {
        "code": "EMS",
        "name": "EMS",
        "shortName": "EMS"
      }
    ]
  }
}
```

### 设置电子面单账户

Http请求方式和地址：POST /logistics/account

#### 请求参数

| 名称        | 类型   | 必须 | 描述                                                         |
| :---------- | :----- | :--- | :----------------------------------------------------------- |
| user        | {}     |      |                                                              |
| shopName    | String | 是   | 店铺名                                                       |
| timestamp   | String | 是   | 当前时间戳                                                   |
| userSign    | String | 是   | 按照规则(md5(shopName + timestamp + userKey))生成的验证合法性签名 |
| companyCode | String | 是   | 快递公司对应的编码，目前支持快递公司：百世快递、中通、申通、圆通、韵达 |
| username    | String | 是   | 电子面单账户用户名，一般由快递站点提供                       |
| password    | String | 是   | 电子面单账户密码，一般由快递站点提供                         |
| storeCode   | String |      | 站点门店编码、名称等，一般由快递公司提供                     |

#### 返回参数

| 名称 | 类型 | 必须 | 描述 |
| :--- | :--- | :--- | :--- |
|      |      |      |      |

暂无数据

#### 请求示例

```
{
  "user": {
    "shopName": "果小美",
    "timestamp": "1527909832028",
    "userSign": "dfb39f93a70cf876a8e94df1305f1553"
  },
  "companyCode": "HTKY",
  "username": "testtest",
  "password": "testpwd"
}
```

### 平台回调

#### 请求参数

| 名称           | 类型   | 必须 | 描述                                                   |
| :------------- | :----- | :--- | :----------------------------------------------------- |
| callbackType   | String | 是   | 消息类型 PRINTED_SEND （打印发货单）CONSIGNED （发货） |
| list           | []     |      |                                                        |
| tradeId        | String | 是   | 订单ID                                                 |
| expressCompany | String |      | 快递公司编码，具体查看快递公司映射列表                 |
| expressNo      | String |      | 单号                                                   |

#### 返回参数

| 名称 | 类型   | 必须 | 描述                                          |
| :--- | :----- | :--- | :-------------------------------------------- |
| code | int    | 是   | 状态，0代表成功，非0会把msg中的内容展现给用户 |
| msg  | String |      | 详情                                          |

说明：

可以在开放平台设置中配置回调地址，可以设置2种消息通知。暂时提供以下两种消息：
打印发货单回调
发货回调

#### 请求示例

```
{
  "callbackType": "PRINTED_SEND",
  "list": [
    {
      "tradeId": "2324354234534",
      "expressCompany": "HTKY",
      "expressNo": "12342413"
    },
    {
      "tradeId": "2324354234534",
      "expressCompany": "HTKY",
      "expressNo": "12342413"
    }
  ]
}
```

#### 返回示例

```
{
  "code": 0,
  "msg": "成功"
}
```




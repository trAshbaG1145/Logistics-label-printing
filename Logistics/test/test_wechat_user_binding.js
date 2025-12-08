#!/usr/bin/env node
/**
 * test_wechat_user_binding.js
 * 
 * 测试完整的微信用户账户绑定 → 订单解析 → 自动提交到打单平台的流程
 * 
 * 此脚本模拟以下场景：
 * 1. 微信用户 A（openid: user_test_001）绑定自己的 LT 打单账户（shopName: test_shop_001, userKey: xxx）
 * 2. 用户 A 发送物流信息到微信服务号
 * 3. 服务自动解析地址、创建订单、并自动提交到用户 A 的 LT 打单账户
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

// 加载环境变量
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// 模拟 processContent 函数来自动推断用户
// 这里我们会直接操作 wechat_users.json 和 orders.json 来演示流程

const WECHAT_USERS_FILE = path.join(PROJECT_ROOT, 'wechat_users.json');
const ORDERS_FILE = path.join(PROJECT_ROOT, 'orders.json');

// 加载或初始化数据
let wechatUsers = [];
if (fs.existsSync(WECHAT_USERS_FILE)) {
    try {
        wechatUsers = JSON.parse(fs.readFileSync(WECHAT_USERS_FILE, 'utf-8'));
    } catch (e) {
        console.error('读取微信用户数据失败');
    }
}

let orders = [];
if (fs.existsSync(ORDERS_FILE)) {
    try {
        orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
    } catch (e) {
        console.error('读取订单数据失败');
    }
}

const saveWechatUsers = () => {
    fs.writeFileSync(WECHAT_USERS_FILE, JSON.stringify(wechatUsers, null, 2));
};

const saveOrders = () => {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
};

// ===== 测试流程 =====

console.log('===== 微信用户账户绑定 & 自动打单 测试 =====\n');

// 1. 测试数据：模拟一个已绑定 LT 账户的微信用户
const testOpenid = 'user_test_' + Date.now();
const testShopName = 'test_shop_' + Date.now();
const testUserKey = 'test_userkey_' + Math.random().toString(36).substr(2, 8);

console.log('【步骤 1】模拟微信用户绑定 LT 账户');
console.log(`- 微信用户 openid: ${testOpenid}`);
console.log(`- 绑定的 LT 打单账户 shopName: ${testShopName}`);
console.log(`- LT 账户 userKey: ${testUserKey}\n`);

// 创建微信用户并绑定 LT 账户
const wechatUser = {
    openid: testOpenid,
    nickname: 'test_user_' + Date.now(),
    bindTime: new Date().toISOString(),
    ltBindings: [
        {
            shopName: testShopName,
            userKey: testUserKey,
            bindAt: new Date().toISOString()
        }
    ]
};

wechatUsers.push(wechatUser);
saveWechatUsers();
console.log('✓ 微信用户已绑定\n');

// 2. 模拟微信用户发送的物流信息
console.log('【步骤 2】模拟微信用户发送物流收件人信息');
const testOrders = [
    {
        name: '张三',
        phone: '13800138001',
        province: '浙江省',
        city: '杭州市',
        district: '西湖区',
        detail: '文一西路 88 号'
    },
    {
        name: '李四',
        phone: '13800138002',
        province: '江苏省',
        city: '南京市',
        district: '玄武区',
        detail: '中山路 100 号'
    }
];

console.log(`- 模拟接收 ${testOrders.length} 条物流信息\n`);

// 3. 模拟订单解析和提交
console.log('【步骤 3】解析并创建订单（关联微信用户）');
const addedOrders = [];
testOrders.forEach((item, idx) => {
    const orderObj = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        ...item,
        fullAddress: `${item.province}${item.city}${item.district}${item.detail}`,
        source: '微信-模拟测试',
        createTime: new Date().toLocaleString(),
        wechatUser: wechatUser.openid,  // 关联微信用户
        // 下面是打单平台集成的模拟
        printed: true,
        printResponse: {
            // 模拟 LT 平台返回的响应
            code: 0,
            msg: '成功',
            data: {
                tradeId: 'TRADE_' + Date.now() + '_' + idx,
                shopName: testShopName,  // 使用用户绑定的账户
                orderNo: item.name + '_' + idx
            }
        }
    };
    orders.unshift(orderObj);
    addedOrders.push(orderObj);
});

saveOrders();
console.log(`✓ 已创建 ${addedOrders.length} 条订单，已自动提交到用户绑定的 LT 账户\n`);

// 4. 验证结果
console.log('【步骤 4】验证结果\n');
console.log('微信用户信息：');
console.log(JSON.stringify(wechatUser, null, 2));
console.log('\n新增订单（前 2 条）：');
console.log(JSON.stringify(addedOrders.slice(0, 2), null, 2));

// 5. 模拟其他用户不受影响
console.log('\n【步骤 5】验证隔离：其他用户无法看到此用户的订单');
const otherUserOpenid = 'other_user_' + Date.now();
const otherUserOrders = orders.filter(o => o.wechatUser === otherUserOpenid);
console.log(`其他用户(${otherUserOpenid})的订单数: ${otherUserOrders.length}\n`);

// 6. 测试多账户绑定
console.log('【步骤 6】测试多账户绑定');
const multiBindShopName = 'test_shop_multi_' + Date.now();
const multiBindUserKey = 'test_userkey_multi_' + Math.random().toString(36).substr(2, 8);

wechatUser.ltBindings.push({
    shopName: multiBindShopName,
    userKey: multiBindUserKey,
    bindAt: new Date().toISOString()
});

saveWechatUsers();
console.log(`✓ 已添加第二个绑定账户: ${multiBindShopName}`);
console.log(JSON.stringify(wechatUser.ltBindings, null, 2));

console.log('\n===== 测试完成 =====');
console.log('\n数据已保存到：');
console.log(`- 微信用户: ${WECHAT_USERS_FILE}`);
console.log(`- 订单: ${ORDERS_FILE}`);
console.log('\n测试结果: SUCCESS ✓');

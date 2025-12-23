#!/usr/bin/env node
/**
 * 脚本说明：获取灵通打单平台的免密登录链接 (ESM版)
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import https from 'https';
import querystring from 'querystring';

// 初始化环境变量
dotenv.config();

// 从环境变量读取配置
const BASE_URL = process.env.LT_BASE_URL || 'https://lttest.800best.com/api/v1';
const APP_ID = process.env.LT_APP_ID;
const APP_KEY = process.env.LT_APP_KEY || process.env.LT_TOKEN;
const SHOP_NAME = process.env.LT_SHOP_NAME;
const USER_KEY = process.env.LT_USER_KEY;

// 检查配置
if (!APP_ID || !APP_KEY || !SHOP_NAME || !USER_KEY) {
    console.error('错误: .env 文件中缺少必要的灵通平台配置。');
    console.error('请检查 LT_APP_ID, LT_APP_KEY, LT_SHOP_NAME, LT_USER_KEY 是否已填写。');
    process.exit(1);
}

// MD5 签名工具
function md5(str) {
    return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

async function getLoginUrl() {
    const timestamp = Date.now().toString();

    // 1. 构造业务参数 (userSign 签名)
    // 规则: md5(shopName + timestamp + userKey)
    const userSign = md5(SHOP_NAME + timestamp + USER_KEY);
    
    const businessData = {
        user: {
            shopName: SHOP_NAME,
            timestamp: timestamp,
            userSign: userSign
        }
    };
    const dataStr = JSON.stringify(businessData);

    // 2. 构造公共参数 (appSign 签名)
    // 规则: md5(appID + timestamp + appKey + data)
    const appTimestamp = Date.now().toString();
    const appSign = md5(APP_ID + appTimestamp + APP_KEY + dataStr);

    const postBody = querystring.stringify({
        appId: APP_ID,
        timestamp: appTimestamp,
        appSign: appSign,
        data: dataStr
    });

    // 3. 发送请求
    const url = `${BASE_URL}/users/login/url`;

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postBody)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    resolve(result);
                } catch (e) {
                    reject(new Error(`解析响应失败: ${body}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postBody);
        req.end();
    });
}

// 执行
getLoginUrl().then(res => {
    if (res.code === 0) {
        console.log('\n✅ 获取成功！请复制以下链接在浏览器打开（链接有效期较短，请尽快使用）：');
        console.log('\n' + res.data + '\n');
        console.log('提示：进入后请点击“订单管理”或“打单”页面查看订单。');
    } else {
        console.error('\n❌ 获取失败:', res.msg);
        console.error('完整响应:', res);
    }
}).catch(err => {
    console.error('\n❌ 请求出错:', err.message);
});

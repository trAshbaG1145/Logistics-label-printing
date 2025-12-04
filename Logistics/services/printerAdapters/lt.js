// 灵通打印平台适配器 — 按 https://ltopen.800best.com/doc 实现签名和 form 表单请求
// 文档: https://ltopen.800best.com/doc
// 说明：本文件提供一个可选的、受环境变量控制的适配器。真实部署前请填写 LT_APP_ID / LT_APP_SECRET 或者 LT_TOKEN，并根据目标 API 文档把 endpoint、请求签名改成正确实现。

import http from 'http';
import https from 'https';
import { createHash } from 'crypto';

const BASE_URL = process.env.LT_BASE_URL || 'https://ltopen.800best.com/api/v1';

function md5(str) {
    return createHash('md5').update(String(str)).digest('hex');
}

// post as application/x-www-form-urlencoded
function postForm(fullUrl, params = {}) {
    const url = new URL(fullUrl, BASE_URL);
    const body = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const options = {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: url.port || (isHttps ? 443 : 80),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    };

    return new Promise((resolve, reject) => {
        const req = client.request(options, (res) => {
            const buf = [];
            res.on('data', (c) => buf.push(c));
            res.on('end', () => {
                const text = Buffer.concat(buf).toString('utf8');
                try { resolve({ statusCode: res.statusCode, body: JSON.parse(text) }); }
                catch (e) { resolve({ statusCode: res.statusCode, body: text }); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

export async function createUser(userPayload) {
    const appId = process.env.LT_APP_ID;
    const appKey = process.env.LT_APP_KEY || process.env.LT_TOKEN;
    const base = process.env.LT_BASE_URL || BASE_URL;

    if (!appId || !appKey) {
        throw new Error('LT app credentials missing (LT_APP_ID/LT_APP_KEY or LT_TOKEN)');
    }

    const timestamp = String(Date.now());
    const dataStr = JSON.stringify(userPayload || {});
    const appSign = md5(appId + timestamp + appKey + dataStr);
    const endpoint = (base.endsWith('/') ? base.slice(0, -1) : base) + '/users/create';

    const res = await postForm(endpoint, { appId, timestamp, appSign, data: dataStr });
    return res.body || res;
}

export async function sendOrder(order, opts = {}) {
    // Prefer platform-level credentials if available; trades API will use shopName + userKey nested in data
    const appId = process.env.LT_APP_ID;
    // Support both LT_APP_KEY and older LT_TOKEN variable names
    const appKey = process.env.LT_APP_KEY || process.env.LT_TOKEN;
    const base = process.env.LT_BASE_URL || BASE_URL; // allow override

    const shopName = opts.shopName || process.env.LT_SHOP_NAME;
    const userKey = opts.userKey || process.env.LT_USER_KEY;

    if (!appId || !appKey) {
        console.log('灵通适配器未配置 LT_APP_ID / LT_APP_KEY，跳过提交。');
        return { skipped: true };
    }

    // Construct trade object according to docs (trades.create)
    const timestamp = String(Date.now());

    // map our order format to LT trade schema (minimal required fields)
    const trade = {
        tradeId: order.id,
        modified: Date.now(),
        payTime: Date.now(),
        status: 'WAIT_SELLER_SEND_GOODS',
        receiverName: order.name || '',
        receiverState: order.province || '',
        receiverCity: order.city || '',
        receiverDistrict: order.district || '',
        receiverAddress: order.detail || order.fullAddress || '',
        receiverPhone: order.phone || '',
        receiverMobile: order.phone || '',
        payment: order.payment || '',
        postFee: order.postFee || '0',
        buyerNick: order.name || '',
        // minimal orders detail required by LT
        orders: [
            {
                orderId: String(order.id),
                price: order.price || '',
                totalFee: order.totalFee || '',
                num: order.num || 1,
                title: order.title || '自动生成商品'
            }
        ]
    };

    // Build data object
    const dataObj = {
        user: {}
    };

    if (shopName && userKey) {
        const userSign = md5(shopName + timestamp + userKey);
        dataObj.user = { shopName, timestamp, userSign };
    } else {
        // leave user empty if not configured — some APIs may allow platform appId auth only
        dataObj.user = { timestamp: timestamp };
    }

    dataObj.trades = [trade];

    const dataStr = JSON.stringify(dataObj);

    // top-level signature: md5(appId + timestamp + appKey + data)
    const appSign = md5(appId + timestamp + appKey + dataStr);

    // POST to /trades/create
    const endpoint = (base.endsWith('/') ? base.slice(0, -1) : base) + '/trades/create';

    try {
        const res = await postForm(endpoint, { appId, timestamp, appSign, data: dataStr });
        // Expected response: { code:0, msg:'成功', data: ... }
        const body = res.body || {};
        if (body && typeof body === 'object' && body.code === 0) {
            return { skipped: false, success: true, response: body };
        }
        return { skipped: false, success: false, response: body };
    } catch (err) {
        return { skipped: false, success: false, error: err.message || String(err) };
    }
}

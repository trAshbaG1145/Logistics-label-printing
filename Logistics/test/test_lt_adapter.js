import http from 'http';
import assert from 'assert';
import { sendOrder } from '../services/printerAdapters/lt.js';
import { createHash } from 'crypto';

function md5(s) { return createHash('md5').update(String(s)).digest('hex'); }

const APP_ID = 'testAppId';
const APP_KEY = 'testAppKey';
const SHOP_NAME = 'testShop';
const USER_KEY = 'testUserKey';

// Start a local server to simulate LT /trades/create behavior
const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/trades/create') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const params = Object.fromEntries(new URLSearchParams(body));
            const { appId, timestamp, appSign, data } = params;
            // validate appId
            try {
                assert.strictEqual(appId, APP_ID);
                // validate signature
                const expected = md5(appId + timestamp + APP_KEY + data);
                assert.strictEqual(appSign, expected);
                const parsed = JSON.parse(data);
                // checks: has user and trades
                assert.ok(parsed.trades && Array.isArray(parsed.trades));

                const response = JSON.stringify({ code: 0, msg: '成功', data: 1 });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(response);
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: 1, msg: String(err) }));
            }
        });
    } else {
        res.writeHead(404); res.end();
    }
});

server.listen(0, async () => {
    const port = server.address().port;
    console.log('模拟 LT 服务监听端口', port);

    // configure env for adapter
    process.env.LT_BASE_URL = `http://127.0.0.1:${port}/api/v1`;
    process.env.LT_APP_ID = APP_ID;
    process.env.LT_APP_KEY = APP_KEY;
    process.env.LT_SHOP_NAME = SHOP_NAME;
    process.env.LT_USER_KEY = USER_KEY;

    const order = {
        id: 'TST12345',
        name: '测试用户',
        phone: '13800138000',
        province: '浙江省',
        city: '杭州市',
        district: '西湖区',
        detail: '测试地址 1 号',
        fullAddress: '浙江省杭州市西湖区测试地址 1 号'
    };

    try {
        const result = await sendOrder(order);
        assert.ok(result.success === true, 'sendOrder should return success==true');
        console.log('LT adapter test passed');
    } catch (err) {
        console.error('LT adapter test failed', err);
        process.exitCode = 2;
    } finally {
        server.close();
    }
});

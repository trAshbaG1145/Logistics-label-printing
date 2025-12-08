import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createUser, sendOrder } from '../services/printerAdapters/lt.js';

// Load .env from Logistics folder
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
    console.log('Starting live createUser + createTrade test (will not echo secrets)');
    const shopName = `auto_test_${Date.now()}`;
    const password = 'A1b2C3d4!';
    const userPayload = {
        shopName,
        password,
        contactName: '自动测试',
        province: '测试省',
        city: '测试市',
        country: '测试区',
        detailAddr: '自动化测试地址',
        mobile: '13800138000'
    };

    try {
        const createResp = await createUser(userPayload);
        console.log('createUser response summary:', createResp && createResp.code === 0 ? 'SUCCESS' : createResp);

        if (!createResp || createResp.code !== 0) {
            console.error('createUser failed; aborting trade test.');
            process.exitCode = 2;
            return;
        }

        const userData = createResp.data || {};
        const userKey = userData.userKey;

        if (!userKey) {
            console.error('createUser returned no userKey; aborting');
            process.exitCode = 2;
            return;
        }

        console.log('User created (shopName present). Proceeding to create trade with returned userKey...');

        const order = {
            id: 'LIVE_TEST_' + Date.now(),
            name: '测试收件人',
            phone: '13800138000',
            province: '浙江省',
            city: '杭州市',
            district: '西湖区',
            detail: '测试地址 123',
            price: '0.01',
            totalFee: '0.01',
            num: 1,
            title: '测试商品'
        };

        const tradeResp = await sendOrder(order, { shopName, userKey });
        // persist created shop credentials to a local gitignored file for audit
        try {
            const fs = await import('fs');
            const storagePath = path.join(__dirname, '..', 'lt_created_users.json');
            let arr = [];
            if (fs.existsSync(storagePath)) {
                try { arr = JSON.parse(fs.readFileSync(storagePath, 'utf8') || '[]'); } catch (_) { arr = []; }
            }
            arr.push({ shopName, password, userKey, createAt: new Date().toISOString() });
            fs.writeFileSync(storagePath, JSON.stringify(arr, null, 2), 'utf8');
            console.log('Saved created shop info to', storagePath);
        } catch (e) {
            console.warn('Failed to persist created user info:', e.message || e);
        }
        console.log('createTrade response summary:', tradeResp && tradeResp.success ? 'SUCCESS' : tradeResp);
        process.exitCode = tradeResp && tradeResp.success ? 0 : 2;
    } catch (err) {
        console.error('Live create+trade test error:', err.message || String(err));
        process.exitCode = 2;
    }
}

run();

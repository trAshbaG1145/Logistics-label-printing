import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getUserInfo, getLoginUrl } from '../services/printerAdapters/lt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const storePath = path.join(__dirname, '..', 'lt_created_users.json');

if (!fs.existsSync(storePath)) {
    console.error('lt_created_users.json 不存在，先运行 test_lt_create_and_trade_live.js');
    process.exit(1);
}

let arr = [];
try {
    arr = JSON.parse(fs.readFileSync(storePath, 'utf8') || '[]');
} catch (e) {
    console.error('无法读取 lt_created_users.json:', e.message || e);
    process.exit(1);
}

async function updateOne(entry) {
    const { shopName, userKey } = entry;
    if (!shopName || !userKey) return entry;
    try {
        const info = await getUserInfo(shopName);
        if (info && info.code === 0 && info.data && info.data.loginName) {
            entry.loginName = info.data.loginName;
        }
    } catch (e) {
        console.warn('获取用户信息失败:', shopName, e.message || e);
    }

    try {
        const loginResp = await getLoginUrl(shopName, userKey);
        if (loginResp && loginResp.code === 0 && loginResp.data) {
            entry.loginUrl = loginResp.data;
        }
    } catch (e) {
        console.warn('获取登录URL失败:', shopName, e.message || e);
    }
    entry.updatedAt = new Date().toISOString();
    return entry;
}

(async () => {
    const updated = [];
    for (const it of arr) {
        const res = await updateOne({ ...it });
        updated.push(res);
    }
    fs.writeFileSync(storePath, JSON.stringify(updated, null, 2), 'utf8');
    console.log('已更新 loginName / loginUrl ->', storePath);
})();

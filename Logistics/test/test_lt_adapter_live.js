import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ensure .env from Logistics/ is loaded regardless of cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { sendOrder } from '../services/printerAdapters/lt.js';

console.log('Running live LT adapter test (using env credentials and LT_BASE_URL)');

// Use LT_BASE_URL from .env if provided; adapter uses default production base otherwise.

const order = {
    id: 'LIVE_TEST_' + Date.now(),
    name: '测试收件人',
    phone: '13800138000',
    province: '浙江省',
    city: '杭州市',
    district: '西湖区',
    detail: '测试地址 123'
};

(async () => {
    try {
        const r = await sendOrder(order);
        if (r.success) {
            console.log('Live sendOrder succeeded:', r.response && r.response.code === 0 ? 'code=0 success' : r.response);
            process.exitCode = 0;
        } else {
            console.error('Live sendOrder failed:', r.error || r.response || 'unknown');
            process.exitCode = 2;
        }
    } catch (err) {
        console.error('Live sendOrder error:', err.message || String(err));
        process.exitCode = 2;
    }
})();

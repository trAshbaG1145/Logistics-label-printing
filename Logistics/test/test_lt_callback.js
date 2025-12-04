import assert from 'assert';
import { handleLtCallback } from '../services/ltCallbackHandler.js';

console.log('Running LT callback handler tests...');

const orders = [
    { id: 'C123', name: 'Alice' },
    { id: 'C456', name: 'Bob' }
];

const payload = {
    callbackType: 'CONSIGNED',
    list: [
        { tradeId: 'C123', expressCompany: 'HTKY', expressNo: 'EXP-001' },
        { tradeId: 'C000', expressCompany: 'HTKY', expressNo: 'EXP-999' }
    ]
};

const updated = handleLtCallback(payload, orders);
assert.strictEqual(Array.isArray(updated), true);
assert.strictEqual(updated.length, 1);
assert.strictEqual(orders[0].status, 'CONSIGNED');
assert.strictEqual(orders[0].expressCompany, 'HTKY');
assert.strictEqual(orders[0].expressNo, 'EXP-001');

console.log('LT callback tests passed.');

// Handle LT platform callbacks and update orders in-memory
// payload: { callbackType: 'PRINTED_SEND'|'CONSIGNED', list: [{ tradeId, expressCompany, expressNo }] }

export function handleLtCallback(payload, orders) {
    if (!payload || !payload.list || !Array.isArray(payload.list)) {
        throw new Error('invalid payload');
    }

    const updated = [];
    for (const item of payload.list) {
        if (!item.tradeId) continue;
        const idx = orders.findIndex(o => String(o.id) === String(item.tradeId));
        if (idx === -1) continue;
        const order = orders[idx];
        if (payload.callbackType === 'PRINTED_SEND') {
            order.printed = true;
            order.printInfo = order.printInfo || {};
            order.printInfo.printedAt = new Date().toLocaleString();
        } else if (payload.callbackType === 'CONSIGNED') {
            order.status = 'CONSIGNED';
            order.expressCompany = item.expressCompany || order.expressCompany;
            order.expressNo = item.expressNo || order.expressNo;
            order.consignTime = new Date().toLocaleString();
        }
        updated.push(order.id);
    }
    return updated;
}

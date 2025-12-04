import * as lt from './lt.js';

const ADAPTER = process.env.PRINTER_ADAPTER || 'lt';

export async function sendOrder(order) {
    switch (ADAPTER) {
        case 'lt':
        default:
            return lt.sendOrder(order);
    }
}

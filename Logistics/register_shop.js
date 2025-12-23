import dotenv from 'dotenv';
import { createUser } from './services/printerAdapters/lt.js';

dotenv.config();

async function main() {
    const appId = process.env.LT_APP_ID;
    const appKey = process.env.LT_APP_KEY || process.env.LT_TOKEN;

    if (!appId || !appKey) {
        console.error('错误: 请先在 .env 文件中配置 LT_APP_ID 和 LT_APP_KEY (或 LT_TOKEN)');
        process.exit(1);
    }

    // 生成随机店铺名以避免冲突
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const shopName = `测试店铺_${randomSuffix}`;

    const userPayload = {
        shopName: shopName,
        contactName: "测试店长",
        province: "浙江省",
        city: "杭州市",
        country: "西湖区", // 注意：API文档中字段名为 country，实际对应区/县
        detailAddr: "文一西路969号",
        mobile: "13800138000"
    };

    console.log(`正在创建店铺: ${shopName}...`);
    console.log(`使用 AppID: ${appId}`);
    console.log(`API 地址: ${process.env.LT_BASE_URL || '默认'}`);

    try {
        const result = await createUser(userPayload);
        
        if (result.code === 0) {
            console.log('\n=== 创建成功 ===');
            console.log('请将以下信息填入 .env 文件:');
            console.log(`LT_SHOP_NAME=${result.data.shopName}`);
            console.log(`LT_USER_KEY=${result.data.userKey}`);
            console.log(`登录用户名: ${result.data.loginName}`);
            console.log(`初始密码: ${result.data.password}`);
            console.log('================\n');
        } else {
            console.error('\n=== 创建失败 ===');
            console.error('错误代码:', result.code);
            console.error('错误信息:', result.msg);
            console.error('完整响应:', JSON.stringify(result, null, 2));
        }

    } catch (err) {
        console.error('\n=== 请求异常 ===');
        console.error(err);
    }
}

main();

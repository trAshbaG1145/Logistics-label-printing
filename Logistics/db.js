// db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 创建连接池
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root', // 这里会读取 .env
    database: process.env.DB_NAME || 'logistics_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 测试连接
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ 数据库连接成功！');
        connection.release();
    } catch (err) {
        console.error('❌ 数据库连接失败:', err.message);
    }
})();

export default pool;

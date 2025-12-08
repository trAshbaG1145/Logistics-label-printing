/**
 * LT OAuth 处理模块
 * 处理与灵通平台的 OAuth 登录流程
 */

import { generateLoginUrl, exchangeAuthCode } from './printerAdapters/lt.js';

/**
 * 初始化 OAuth 状态管理
 * @returns {object} OAuth 状态管理对象
 */
export function createOAuthStateManager() {
    const states = new Map();
    
    return {
        /**
         * 生成 OAuth state 值用于防 CSRF
         * @param {string} openid - 微信用户 openid
         * @returns {string} state 值
         */
        generate: (openid) => {
            const state = `${openid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            states.set(state, {
                openid,
                state,
                createdAt: Date.now(),
                expires: Date.now() + 10 * 60 * 1000  // 10分钟有效期
            });
            // 清理过期的 state
            for (const [key, value] of states.entries()) {
                if (value.expires < Date.now()) {
                    states.delete(key);
                }
            }
            return state;
        },
        
        /**
         * 验证并消费 OAuth state 值（一次性使用）
         * @param {string} state - state 值
         * @returns {object} {valid, openid} 或 {valid: false, error}
         */
        consume: (state) => {
            const stored = states.get(state);
            if (!stored || stored.expires < Date.now()) {
                if (stored) states.delete(state);
                return { valid: false, error: 'state 无效或已过期' };
            }
            states.delete(state);  // 一次性使用
            return { valid: true, openid: stored.openid };
        }
    };
}

/**
 * 为路由创建 OAuth 处理器
 * @param {object} wechatUsers - 微信用户数据数组
 * @param {function} bindLtAccount - 绑定账户函数
 * @param {function} saveWechatUsers - 保存用户数据函数
 * @param {object} oauthStateManager - OAuth 状态管理器
 * @returns {object} 包含各个路由处理函数
 */
export function createOAuthHandlers(wechatUsers, bindLtAccount, saveWechatUsers, oauthStateManager) {
    return {
        /**
         * 检查用户是否已绑定账户
         */
        checkBinding: (req, res) => {
            try {
                const { openid } = req.params;
                const user = wechatUsers.find(u => u.openid === openid);
                
                if (!user || !user.ltBindings || user.ltBindings.length === 0) {
                    return res.json({ code: 0, msg: '用户未绑定', data: { bound: false } });
                }
                
                res.json({
                    code: 0,
                    msg: '用户已绑定',
                    data: {
                        bound: true,
                        bindings: user.ltBindings,
                        primaryBinding: user.ltBindings[0]
                    }
                });
            } catch (err) {
                console.error('检查绑定状态失败:', err);
                res.json({ code: 1, msg: String(err) });
            }
        },
        
        /**
         * 获取灵通登录页面 URL
         */
        getLoginUrl: (req, res) => {
            try {
                const { openid } = req.params;
                if (!openid) {
                    return res.status(400).json({ code: 1, msg: '缺少参数: openid' });
                }
                
                const state = oauthStateManager.generate(openid);
                // 兼容用户把协议写进 SERVER_HOST 的情况，统一去掉 http(s)://
                const rawHost = process.env.SERVER_HOST || 'localhost:3001';
                const host = rawHost.replace(/^https?:\/\//, '');
                const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
                const callbackUrl = `${protocol}://${host}/api/lt/oauth/callback`;
                
                const { loginUrl } = generateLoginUrl(state, callbackUrl);
                
                res.json({
                    code: 0,
                    msg: '获取登录 URL 成功',
                    data: { loginUrl, state }
                });
            } catch (err) {
                console.error('获取登录 URL 失败:', err);
                res.json({ code: 1, msg: String(err) });
            }
        },
        
        /**
         * 处理灵通 OAuth 回调
         */
        handleCallback: async (req, res) => {
            try {
                const { state, authCode, code: errorCode, msg: errorMsg } = req.query;
                
                const stateValid = oauthStateManager.consume(state);
                if (!stateValid.valid) {
                    return res.status(400).json({
                        code: 1,
                        msg: `OAuth 失败: ${stateValid.error}`
                    });
                }
                
                const { openid } = stateValid;
                
                if (errorCode || errorMsg) {
                    return res.status(400).json({
                        code: 1,
                        msg: `灵通登录失败: ${errorMsg || errorCode}`
                    });
                }
                
                if (!authCode) {
                    return res.status(400).json({
                        code: 1,
                        msg: '缺少授权码 authCode'
                    });
                }
                
                console.log(`处理 OAuth 回调: openid=${openid}, authCode=${authCode}`);
                const authResult = await exchangeAuthCode(authCode);
                
                if (!authResult.success) {
                    console.error('交换 authCode 失败:', authResult.error);
                    return res.status(400).json({
                        code: 1,
                        msg: `获取用户凭证失败: ${authResult.error}`
                    });
                }
                
                const { shopName, userKey, loginName } = authResult.data;
                
                if (!shopName || !userKey) {
                    return res.status(400).json({
                        code: 1,
                        msg: '灵通返回的凭证不完整'
                    });
                }
                
                const user = bindLtAccount(openid, shopName, userKey);
                const binding = user.ltBindings.find(b => b.shopName === shopName);
                if (binding && loginName) {
                    binding.loginName = loginName;
                    saveWechatUsers();
                }
                
                console.log(`用户 ${openid} 已成功绑定账户 ${shopName}`);
                
                res.json({
                    code: 0,
                    msg: '账户绑定成功',
                    data: {
                        openid,
                        shopName,
                        loginName,
                        binding: {
                            shopName,
                            userKey,
                            loginName,
                            bindAt: binding.bindAt
                        }
                    }
                });
            } catch (err) {
                console.error('OAuth 回调处理失败:', err);
                res.status(500).json({
                    code: 1,
                    msg: `服务器错误: ${err.message || String(err)}`
                });
            }
        }
    };
}

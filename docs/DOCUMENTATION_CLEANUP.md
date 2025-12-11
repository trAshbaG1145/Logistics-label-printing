# 文档整理说明

## 更新日期
2025年12月11日

## 变更摘要

本次文档整理删除了不相关和过时的文档,并创建了反映当前实现的新文档。

## 已删除/移动的文档

### 1. 不相关内容
- `开源项目合集.md` - **建议删除**
  - 原因: 包含 FPGA/PYNQ 开源项目列表,与本物流打单系统完全无关
  - 操作: 可安全删除

### 2. 过时的绑定功能文档

以下文档描述的是**已废弃的 OAuth 手动绑定功能**,该功能已被**自动创建店铺**功能替代:

- `README_BINDING_IMPLEMENTATION.md` - **建议删除或归档**
  - 内容: 详细描述 OAuth 绑定流程的实现
  - 状态: 功能已被自动创建店铺替代
  - 替代文档: `docs/AUTO_SHOP_CREATION.md`

- `BINDING_IMPLEMENTATION_SUMMARY.md` - **建议删除或归档**
  - 内容: OAuth 绑定功能实现总结
  - 状态: 功能已被自动创建店铺替代
  - 替代文档: `docs/AUTO_SHOP_CREATION.md`

- `ACCEPTANCE_CHECKLIST.md` - **建议删除或归档**
  - 内容: OAuth 绑定功能验收清单
  - 状态: 功能已被自动创建店铺替代

- `docs/WECHAT_USER_BINDING.md` - **需要更新或删除**
  - 内容: OAuth 绑定的设计文档
  - 状态: 描述的 OAuth 流程已不再使用
  - 问题: 
    - 提到的 OAuth 授权流程已移除
    - generateOAuthState、consumeOAuthState 等函数在代码中已废弃
    - `/api/lt/oauth/callback` 端点虽存在但主流程不再使用

- `docs/QUICK_START_BINDING.md` - **需要更新或删除**
  - 内容: OAuth 绑定快速开始指南
  - 状态: 指导用户手动绑定,但当前是自动创建流程
  - 问题: 不适用于当前的自动创建店铺流程

- `docs/test_binding_api.sh` - **可能需要更新**
  - 内容: 测试绑定 API 的脚本
  - 状态: 测试的是旧的手动绑定 API
  - 建议: 如果手动绑定 API 仍保留(用于高级用户),可以保留;否则删除

## 新增文档

### `docs/AUTO_SHOP_CREATION.md`
**当前实现的核心功能文档**

内容包括:
- 自动创建店铺功能说明
- 配置指南(`LT_AUTO_CREATE`, `LT_DEFAULT_SENDER_*` 等)
- 工作流程图
- 地址类型识别(发件人/收件人)
- 数据结构说明
- 故障排查指南

## 更新的文档

### `.github/copilot-instructions.md`
已更新以反映当前实现:
- ✅ 图片处理: 现在下载并转为 base64
- ✅ 微信验证: 使用环境变量 `WECHAT_TOKEN`
- ✅ 自动创建店铺功能说明
- ✅ 地址智能识别机制
- ✅ 完整的环境变量列表
- ✅ 核心功能概述

## 当前有效的功能

### 主流程: 自动创建店铺
1. 用户首次发送地址信息到微信
2. 系统解析地址并判断是发件人还是收件人信息
3. 如果用户未绑定店铺且 `LT_AUTO_CREATE=true`,自动创建店铺
4. 系统获取登录 URL 并通过微信客服消息发送给用户
5. 店铺与微信用户自动绑定

### 保留的 API (用于高级场景)
以下 API 仍然可用,但不再是主流程:
- `POST /api/lt/bind` - 手动绑定
- `GET /api/lt/accounts/:openid` - 查询绑定
- `POST /api/lt/unbind` - 解绑

## 建议的操作

### 立即删除
```bash
# 不相关内容
rm "开源项目合集.md"

# 过时的实现文档
rm "README_BINDING_IMPLEMENTATION.md"
rm "BINDING_IMPLEMENTATION_SUMMARY.md"
rm "ACCEPTANCE_CHECKLIST.md"
```

### 删除或更新
```bash
# 如果不再需要 OAuth 相关文档
rm "docs/WECHAT_USER_BINDING.md"
rm "docs/QUICK_START_BINDING.md"
rm "docs/test_binding_api.sh"

# 或者移动到归档目录
mkdir -p docs/archived
mv docs/WECHAT_USER_BINDING.md docs/archived/
mv docs/QUICK_START_BINDING.md docs/archived/
mv docs/test_binding_api.sh docs/archived/
```

### 保留
- `README.md` (项目根目录) - 项目概述
- `Logistics/README.md` - 服务使用说明
- `docs/AUTO_SHOP_CREATION.md` - **当前核心功能文档**
- `.github/copilot-instructions.md` - AI 助手指南

## 文档结构建议

```
项目根目录/
├── README.md                           # 项目总览
├── .github/
│   └── copilot-instructions.md         # AI 助手使用指南
├── docs/
│   ├── AUTO_SHOP_CREATION.md           # ✨ 自动创建店铺(当前核心功能)
│   └── archived/                       # 历史文档归档(可选)
│       ├── WECHAT_USER_BINDING.md      
│       ├── QUICK_START_BINDING.md
│       └── test_binding_api.sh
└── Logistics/
    ├── README.md                       # 服务说明
    └── .env.example                    # 配置模板
```

## 注意事项

1. **OAuth 代码保留**: 虽然 OAuth 流程不再是主流程,但代码中仍保留了相关函数(如 `oauthHandlers`),用于兼容性或特殊场景。

2. **手动绑定 API 保留**: `/api/lt/bind` 等接口仍然可用,可以用于:
   - 高级用户手动管理绑定
   - 测试和调试
   - 未来可能的 H5 绑定页面

3. **数据结构兼容**: `wechat_users.json` 的数据结构保持不变,新旧功能可以共存。

4. **迁移建议**: 如果有用户正在使用旧的手动绑定流程,建议保留相关文档到 `docs/archived/` 目录,并在主 README 中说明已弃用。

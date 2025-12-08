#!/bin/bash
# test_binding_api.sh - 测试微信用户账户绑定 API

HOST=${1:-"http://localhost:3001"}

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===== 微信用户账户绑定 API 测试 =====${NC}\n"

# 生成测试 openid
OPENID="test_user_$(date +%s)"
SHOP_NAME="test_shop_$(date +%s)"
USER_KEY="test_key_$(date +%s)"

echo -e "${GREEN}测试数据：${NC}"
echo "  openid: $OPENID"
echo "  shopName: $SHOP_NAME"
echo "  userKey: $USER_KEY"
echo ""

# 1. 测试绑定账户
echo -e "${GREEN}【测试 1】绑定账户 - POST /api/lt/bind${NC}"
curl -X POST "$HOST/api/lt/bind" \
  -H "Content-Type: application/json" \
  -d "{
    \"openid\": \"$OPENID\",
    \"shopName\": \"$SHOP_NAME\",
    \"userKey\": \"$USER_KEY\"
  }" | jq .
echo ""
echo ""

# 2. 测试查询账户
echo -e "${GREEN}【测试 2】查询绑定账户 - GET /api/lt/accounts/:openid${NC}"
curl -s "$HOST/api/lt/accounts/$OPENID" | jq .
echo ""
echo ""

# 3. 测试添加第二个账户
echo -e "${GREEN}【测试 3】添加第二个绑定账户${NC}"
SHOP_NAME_2="test_shop_2_$(date +%s)"
USER_KEY_2="test_key_2_$(date +%s)"
curl -X POST "$HOST/api/lt/bind" \
  -H "Content-Type: application/json" \
  -d "{
    \"openid\": \"$OPENID\",
    \"shopName\": \"$SHOP_NAME_2\",
    \"userKey\": \"$USER_KEY_2\"
  }" | jq '.data.ltBindings'
echo ""
echo ""

# 4. 测试解绑账户
echo -e "${GREEN}【测试 4】解绑账户 - POST /api/lt/unbind${NC}"
curl -X POST "$HOST/api/lt/unbind" \
  -H "Content-Type: application/json" \
  -d "{
    \"openid\": \"$OPENID\",
    \"shopName\": \"$SHOP_NAME_2\"
  }" | jq '.data.ltBindings'
echo ""
echo ""

# 5. 最终验证
echo -e "${GREEN}【测试 5】最终验证 - 查询最终状态${NC}"
curl -s "$HOST/api/lt/accounts/$OPENID" | jq .
echo ""

echo -e "${GREEN}✓ 所有测试完成${NC}"

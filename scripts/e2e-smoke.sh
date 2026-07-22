#!/usr/bin/env bash
# Smoke checks for a running MCPShield stack (local or prod compose).
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:7802}"
MCP_BASE="${MCP_BASE:-http://localhost:7801}"
API_KEY="${API_KEY:-}"
MCP_API_KEY="${MCP_API_KEY:-}"

api_auth_hdr=()
mcp_auth_hdr=()
if [[ -n "${API_KEY}" ]]; then
  api_auth_hdr=(-H "Authorization: Bearer ${API_KEY}")
fi
if [[ -n "${MCP_API_KEY}" ]]; then
  mcp_auth_hdr=(-H "Authorization: Bearer ${MCP_API_KEY}")
fi

echo "==> MCP health"
curl -sf "${MCP_BASE}/health" | tee /dev/stderr | grep -q '"status":"ok\|"status": "ok"'
echo

echo "==> API health"
curl -sf "${API_BASE}/health" | tee /dev/stderr | grep -q ok
echo

echo "==> API config (public)"
curl -sf "${API_BASE}/api/config" | tee /dev/stderr
echo

echo "==> API state"
if [[ ${#api_auth_hdr[@]} -gt 0 ]]; then
  curl -sf "${api_auth_hdr[@]}" "${API_BASE}/api/state" | tee /dev/stderr | grep -q findings
else
  curl -sf "${API_BASE}/api/state" | tee /dev/stderr | grep -q findings
fi
echo

echo "==> MCP SSE handshake (expect event-stream headers)"
if [[ ${#mcp_auth_hdr[@]} -gt 0 ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -N --max-time 2 \
    "${mcp_auth_hdr[@]}" -H "Accept: text/event-stream" "${MCP_BASE}/sse" || true)
else
  code=$(curl -s -o /dev/null -w "%{http_code}" -N --max-time 2 \
    -H "Accept: text/event-stream" "${MCP_BASE}/sse" || true)
fi
if [[ "$code" != "200" && "$code" != "000" ]]; then
  # 000 = timeout after stream opened (OK for SSE)
  echo "Unexpected MCP SSE status: $code" >&2
  exit 1
fi
echo "SSE reachable (status=${code})"

echo
echo "All smoke checks passed."

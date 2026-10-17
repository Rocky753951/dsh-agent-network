# Pairing flow and state contract

描述 client 与 Host 连接器的边界。默认路径是零配置发现：`GET /api/agent-network/v1/bridge-config`（仅 loopback 页面可读）→ `POST /api/agent-network/v1/local`，体为 `{operation, payload}` + `x-agent-network-token`。手工配置时 operation 仍可由 `agentNetworkBridge.endpoints` 显式提供，或由 `request({ operation, endpoint, payload, protocolVersion })` adapter 映射到正式 RPC；连接器内部再把 operation 翻成 DAN method（见 `PROTOCOL.md` 11.6）。

## 用户流程

1. Host：填写邀请有效时长与权限，点击“创建邀请”；收到 `invite_code` 后可复制。
2. Peer：粘贴邀请/配对码，点击“加入”；状态进入 `pending_approval`。
3. Host：查看加入请求，选择权限与时长，点击“批准”；Peer 等待审批。
4. 双方：各自点击“确认连接”；仅双方确认后进入 `connected`。
5. Connected：双方看到实时状态与逐秒倒计时；过期进入 `expired`，任意一方撤销进入 `revoked`。
6. 刷新/重开面板：从 `localStorage["dsh-agent-network:pairing"]` 恢复 `pairing_id`/状态/过期时间，继续每 5 秒 `status` 轮询；进入 `revoked`/`rejected`/`expired` 后停止轮询并清除存储。

## 状态

`idle → invite_created → pending_approval → approved → awaiting_confirmation → connected → expired|revoked|failed`。状态更新以 bridge `pairing_status` 为准，客户端不自行推断授权成功。

## Payload/结果最小字段

正式 operation 顺序：`invite.create → join.request → approve → session.open → status/revoke`。

- `invite.create`: `role: host`, `scope_allowlist`, `duration_seconds`, `idempotency_key`
- `join.request`: 脱敏 `invite_code`，`role: peer`，`idempotency_key`
- `approve`: `pairing_id`，Host 选择 `scope_allowlist` 与 `duration_seconds`
- `session.open`: 双方确认 token/confirmation；不得在 UI 暴露原始 secret
- `status/revoke`: `pairing_id`；状态响应包含 `expires_at`/`remaining_seconds`
- result: 分层的 Invitation/Join/Grant/Session 对象、`state`、脱敏 token、`error?`

Host formal RPC（远程节点）仍由 HMAC 签名与非本机来源负责；连接器只服务 loopback 页面，凭据是独立下发的连接器令牌。client 只展示权威状态与错误，不猜测端口/路径/协议（端口缺省 8787，可用 `__DSH_AGENT_NETWORK_PORT__` 覆盖）。

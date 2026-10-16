# DSH Agent Network Protocol（最小跨 Agent 通信协议）

- **状态**：调研与设计草案（不修改 DSH 代码）
- **版本**：`dan/0.1`
- **目标**：让两个独立 DSH Host/Agent 以最小、可审计、可重试的方式通信；不把现有 UI/Team 内部事件误当成跨进程协议。

## 1. 已安装能力与边界（截至 2026-10-15）

当前安装 `@deepseek-ai/dsh` 版本为 `0.2.0-rc.2`。与网络/跨 Agent 最相关的已安装包：

1. **`@deepseek-ai/dsh-host-webserver`**：Node HTTP server；插件可注册精确 HTTP 路由和精确 WebSocket upgrade 路由。默认 `127.0.0.1`；设为 `0.0.0.0` 时自身不提供 TLS、认证或 Origin 策略。
2. **`@deepseek-ai/dsh-client-connection`**：浏览器/Host 连接层；HTTP `/api` bridge、JSON RPC、WebSocket 传输、Host/Origin 信任围栏、浏览器会话 Cookie、`ctx.connection.admit(request)` Peer admission，以及带抖动的指数重连。
3. **`@deepseek-ai/dsh-api-gateway`**：Host `ctx.typertGateway.invoke/stream` 与 Client `ctx.remote`。Remote mux 固定路径为 `/api/remote.mux`，逻辑流帧为 `open/item/end/cancel` 和 `item/error/end`；支持单 socket 多路复用、取消、心跳、有限 uplink 缓冲。
4. **`@deepseek-ai/dsh-acp`**：`dsh --profile acp` 通过 **JSON-RPC stdio** 暴露 ACP v1：`initialize`、`session/new/list/resume/close`、`session/prompt/cancel`、更新和权限请求。文档明确 `authenticate` 立即成功，服务器不要求认证；适合受信任的本机自动化，不应直接暴露到网络。
5. **`@deepseek-ai/dsh-experimental-agent-team`**：同一 Session/进程/共享工作目录内的 Lead/teammate mailbox 与 CAS task board；消息持久化且重启可恢复，但明确不是跨进程共识或跨工作目录网络协议。
6. **可用的其他网络相关组件**：`dsh-http-proxy`、`dsh-webhook`、`dsh-mcp-client` 等可作为集成素材，但本调研未发现一个已发布、带跨 DSH Agent 身份/握手/任务语义的统一网络协议。

**结论**：现有最可复用的 Host 网络承载是 `dsh-host-webserver` 的精确路由 + `dsh-client-connection` 的 admission/trust + （需要流式时）`dsh-api-gateway` mux。ACP 是成熟的 Agent 控制面，但当前是 stdio、无认证，不是安全的跨主机传输。Agent Team 是进程内协调，不可直接扩展为跨 DSH 网络共识。

## 2. 最小部署模型

每个 DSH 实例称为一个 **Node**，由一个 Network Adapter 插件提供：

- `POST /api/agent-network/v1/rpc`：请求/响应消息（推荐默认路径）。
- `GET/Upgrade /api/agent-network/v1/stream`：可选长连接事件/任务流；无流式需求时可以只实现 POST。
- 适配器在 Host 路由注册时使用 exact path，先执行认证和大小限制，再进入 Agent/任务服务。
- 连接端不直接调用任意 Typert endpoint；网络 API 只暴露显式 allowlist 的 network methods。

传输使用 UTF-8 JSON；单请求默认上限 1 MiB、单消息 256 KiB、队列和并发限额由部署配置决定。二进制内容只传内容寻址引用（`sha256:<hex>`）及受限下载地址，不在本协议内内嵌。

## 3. 节点身份

节点身份是持久、不可复用的 `node_id`（建议 UUIDv4 或随机 128-bit，大小写规范化为小写），而不是进程 PID、端口或 hostname：

```json
{
  "node_id": "01j...",
  "instance_id": "随机启动实例 ID",
  "agent_id": "本节点内 Agent 的稳定 ID",
  "protocol": "dan/0.1",
  "capabilities": ["rpc", "events", "tasks"],
  "workspace_fingerprint": "sha256:...（可选，禁止发送绝对路径）"
}
```

`node_id` 由凭据存储生成并持久化；`instance_id` 每次启动生成，用于防止旧连接/旧消息混入。连接身份绑定为 `(node_id, instance_id, session_id)`；任务身份为 `(origin_node_id, task_id)`，全局不依赖短整数。

## 4. 握手（Hello/Welcome）

握手发生在认证后的首个 RPC 或 WebSocket 首帧；版本不兼容必须显式拒绝，不得静默降级。

客户端发送：

```json
{
  "kind": "hello",
  "protocol": "dan/0.1",
  "request_id": "uuid",
  "node": {"node_id":"A","instance_id":"I-A","agent_id":"agent-A"},
  "nonce": "base64url-32bytes",
  "features": {"events":true,"tasks":true,"max_message_bytes":262144},
  "auth": {"scheme":"hmac-sha256","key_id":"A-key","proof":"base64url"}
}
```

Host 回复：

```json
{
  "kind": "welcome",
  "protocol": "dan/0.1",
  "request_id": "同 hello",
  "node": {"node_id":"B","instance_id":"I-B","agent_id":"agent-B"},
  "nonce": "base64url-32bytes",
  "accepted_features": {"events":true,"tasks":true},
  "expires_at": "RFC3339"
}
```

`proof` 覆盖 canonical JSON 的 `protocol + request_id + node + nonce + peer_nonce（若已有）+ features`；实现必须固定字段排序、UTF-8、无空白序列化。Welcome 证明对方也持有密钥（双向 HMAC）后才建立会话。拒绝码：`unauthorized`、`replay`、`unsupported_version`、`policy_denied`、`rate_limited`。

## 5. 统一消息封套

所有后续消息使用：

```json
{
  "kind": "request|response|event|ack|cancel",
  "protocol": "dan/0.1",
  "request_id": "uuid（请求全程不变）",
  "message_id": "单调生成的 UUID/ULID",
  "session_id": "连接会话 ID",
  "sender": "node_id",
  "recipient": "node_id",
  "sent_at": "RFC3339",
  "ttl_ms": 30000,
  "seq": 42,
  "body": {},
  "trace": {"trace_id":"...","parent_id":"..."},
  "auth": {"key_id":"...","mac":"base64url"}
}
```

- `message_id` 去重；接收方至少保留 TTL 窗口内的已处理 ID。
- `request_id` 关联 response；response 必须包含 `ok` 或稳定 `error.code`。
- `seq` 仅在同一 `(sender, session_id)` 单调递增；断线重连不得假定连续，需用 `resume_after`/业务 cursor。
- `ack` 表示**持久接收/入队**，不表示任务完成；任务完成必须用 `task.result`。
- 敏感 payload 不写日志；日志只保留 ID、类型、大小、状态和 hash。

核心 RPC body：`ping`、`describe`、`message.send`、`task.submit`、`task.accept`、`task.progress`、`task.cancel`、`task.result`、`event.subscribe`、`event.resume`。

## 6. 任务协作语义

### 6.1 提交与租约

`task.submit` 必须包含：`task_id`（发起方生成）、`objective`、`input`、`idempotency_key`、`deadline`、`required_capabilities`、`write_scopes`（仅提示，不是授权）。接收方返回 `ack` 后处于 `queued`；明确 `task.accept` 后为 `running`。

任务状态单向推进：

`queued -> running -> succeeded | failed | cancelled | expired`。

每个任务带 `lease_id`、`lease_expires_at`；续租失败/过期后，执行方必须停止副作用或转入可恢复状态。结果必须引用原 `task_id` 与 `attempt`，并携带 `result_hash`。跨节点共享文件不是协议保证；用 artifact hash + 明确上传/下载授权替代路径共享。

### 6.2 事件与进度

`task.progress` 是可丢弃通知，带 `progress_seq`；最终 `task.result` 是唯一权威终态。事件订阅返回 cursor；重连以 `event.resume(cursor)` 请求补发，发现 gap 必须返回 `cursor_gap`，由消费者重新 `task.get`/快照，而不是猜测缺失事件。

### 6.3 协作冲突

任务更新使用 `expected_revision`（CAS）。冲突返回 `conflict` 并包含当前 revision；不能覆盖写。对外暴露的执行权限、工具名称、工作区范围必须在接收 Host 的 allowlist 中再次校验。

## 7. 鉴权与传输安全

**首选**：TLS（公网/跨主机）+ 双向 mTLS；证书 SAN 绑定 `node_id`，短期密钥轮换。若只能在受控内网/loopback：TLS 或 Unix socket + 双向 HMAC（密钥放 DSH credentials，不放 URL、日志、任务正文）。每个请求都校验：认证、`sender/recipient`、协议版本、时间窗/TTL、nonce/message_id 去重、速率与 body 上限。

**不要复用**浏览器 launch token、浏览器 session cookie、ACP 的“无认证”模式作为 Agent-to-Agent bearer；不要把 `trustedHosts` 当身份认证，它只解决 Host/Origin 信任围栏。跨站/反向代理部署应显式设置 trusted authorities 与 TLS 终止策略。

最小授权：按 `key_id -> node_id -> capability -> method -> workspace scope` 映射；默认拒绝。任务执行应使用独立、可撤销的 capability token，禁止把上游凭据转发给下游 Agent。

## 8. 重试、超时与幂等

- 只对连接失败、`408/429/5xx`、明确 `temporary_unavailable` 重试；认证失败、参数错误、策略拒绝不重试。
- 默认：请求 deadline 30s；重试 5 次；延迟 `random(0.5,1.0) * min(500ms*2^attempt,10s)`，并受整体 deadline 限制。借鉴已安装 ConnectionController 的 500ms、1s、2s、4s、8s、10s cap 与 jitter。
- `task.submit` 必须带幂等键；重试发送同一 `message_id`/`idempotency_key`，服务端返回已存在的 ack/result，不重复启动任务。
- 长连接重连使用新 `instance_id`/连接 session；先重新握手，再按 cursor/resume 请求恢复。没有 cursor 的通知不可假定可重放。
- 取消是 best-effort：`task.cancel` 要求停止新副作用；服务端仍须发送最终 `cancelled` 或 `succeeded`（若取消到达过晚）。

## 9. 与现有 DSH API 的映射建议

| DAN 能力 | 可复用 DSH 能力 | 注意 |
|---|---|---|
| HTTP 路由 | `host-webserver.register` | webserver 本身无 TLS/认证；Adapter 必须自带 admission |
| Peer admission | `ctx.connection.admit(request)` | 这是浏览器/Host operator 语义，仍需绑定 DAN node credential |
| RPC/流 | `connection.rpc`、`typertGateway.invoke/stream`、`/api/remote.mux` | 只挂载 allowlist；不要将任意 Remote 暴露给网络 |
| 心跳/取消 | Gateway Ping/Pong、AbortSignal | 调整 heartbeat 以适应事件循环；取消须传播到 Agent 任务 |
| 重连 | `ConnectionController` | 其 generation 语义可借鉴，业务事件需自己提供 cursor/gap repair |
| 本机 Agent 自动化 | ACP stdio | 无认证，限定为本机受信任子进程或在外层安全隧道内 |
| 同一进程协作 | Agent Team mailbox/task board | 不能替代跨进程、跨主机协议；CAS/持久化语义可借鉴 |

## 10. 关键风险与上线前检查

1. **裸露 Host**：`host-webserver` 绑定 `0.0.0.0` 不提供 TLS/认证；必须前置 TLS/mTLS 或仅 loopback/Unix socket。
2. **ACP 误暴露**：ACP `authenticate` 无条件成功；绝不能把 stdio server 直接改造成公网端口。
3. **浏览器 Cookie 风险**：当前 loopback Cookie 有意不带 `Secure`；不要当作跨主机身份凭据。
4. **重放/双执行**：网络重试会重复提交；必须服务端幂等键、message 去重和任务 lease。
5. **事件丢失**：Remote 通知默认不重放；必须 cursor、gap 检测和快照恢复。
6. **背压**：Gateway uplink 只有有限 inbox（默认 262144 bytes），超限会失败；DAN 必须限制队列并提供 ack/backpressure。
7. **共享目录误解**：Team 明确共享一个 checkout、没有跨进程锁；跨节点只交换受控 artifacts/hash。
8. **协议降级/混淆**：固定 `dan/0.1`、canonical 签名、严格字段/大小校验；未知 capability 默认拒绝。
9. **权限扩散**：下游不应继承上游全部工具、凭据或 workspace；每次任务重新做 capability/scope 校验。
10. **日志泄密**：禁止记录 token、HMAC、Cookie、prompt 原文和绝对路径；保留关联 ID 与审计结果即可。

**最小可行实现顺序**：先做 loopback HTTP POST + 双向 HMAC + hello/welcome + `message.send`/`task.submit/result`；加入幂等/重试/lease 后再启用 WebSocket 事件；公网部署最后才加入 mTLS 与证书轮换。

## 11. DAN/0.1 v0 冻结合同（Contract Freeze）

本节是 v0 的机器可测合同；与本节冲突的早期草案文字以本节为准。v0 只定义 HTTP RPC 必选面，事件流是可选扩展。实现不得把 Demo API（`/register`、`/send`、`/receive`）宣称为 DAN/0.1。

### 11.1 路由与 HTTP 行为

| 方法 | 路径 | 用途 | 是否必需 |
|---|---|---|---|
| `POST` | `/api/agent-network/v1/rpc` | 握手及全部请求/响应 RPC | 必需 |
| `GET`/WebSocket upgrade | `/api/agent-network/v1/stream` | 已认证会话的事件/进度流 | 可选（无此能力时必须在 hello 中声明 `events:false`） |

RPC 请求必须使用 `Content-Type: application/json`、UTF-8、无压缩要求；成功和协议错误均返回 JSON。推荐状态码：`200`（已处理）、`202`（已接受/排队）、`400`（封套或参数错误）、`401`（认证失败）、`403`（授权/来源策略拒绝）、`404`（未知 RPC method）、`409`（幂等冲突/状态冲突）、`413`（超过大小限制）、`429`（限流）、`500`（内部错误）、`503`（临时不可用）。HTTP 状态与封套内 `error.code` 必须一致映射，不以 200 隐藏协议失败。

v0 限制：请求体 ≤1 MiB；单个 `body` ≤256 KiB；服务端必须设置并执行队列、并发和请求 deadline。未知路径、未知 HTTP method、缺失或重复关键字段应拒绝，不自动改写到 Demo 路由。

### 11.2 Canonical JSON 与统一封套

v0 使用 **Canonical JSON v0**：对象键按 UTF-8 字节的字典序递归排序；数组保持顺序；字符串使用 RFC 8259 JSON 转义并采用 UTF-8；数字必须是有限值，使用 JSON 数字的最短合法表示（禁止 `NaN`、`Infinity`、`-0`）；省略 `undefined` 字段；不添加空白；对象不得含重复键。签名输入编码为 UTF-8，禁止 BOM。实现应在验签前拒绝不符合 canonical 规则的请求，不能先解析再用另一种序列化方式“修正”签名。

除 `hello`/`welcome` 外，v0 RPC 封套的必需字段如下（字段名固定，额外顶层字段拒绝）：

```json
{
  "protocol": "dan/0.1",
  "kind": "request|response|ack|cancel|event",
  "request_id": "UUID/ULID 字符串",
  "message_id": "UUID/ULID 字符串",
  "session_id": "非空字符串",
  "sender": "node_id",
  "recipient": "node_id",
  "sent_at": "RFC3339 UTC",
  "ttl_ms": 30000,
  "seq": 42,
  "method": "task.submit",
  "body": {},
  "auth": {
    "alg": "HS256",
    "key_id": "sender-key",
    "ts": "RFC3339 UTC",
    "nonce": "base64url 至少 16 字节",
    "mac": "base64url 32 字节"
  }
}
```

`method` 在 `kind=event` 时仍保留；`response/ack` 必须带 `reply_to`（请求的 `message_id`）和 `ok`，成功值使用 `result`，失败使用 `error`，不可同时出现；`event` 不要求 `reply_to`。`trace` 是允许的可选对象（仅含 `trace_id`、`parent_id`），其余顶层扩展必须通过版本升级。`ttl_ms` 范围为 1,000–300,000；接收时间超过 `sent_at + ttl_ms` 的消息拒绝。

`request_id` 标识一次逻辑调用，重试不变；`message_id` 标识一次传输消息，重试也不变；`seq` 在 `(sender, session_id)` 内递增但不用于推断重放完整性。所有 ID 比较按字面大小写敏感，生成方应使用小写。

### 11.3 HMAC 字段与签名规则

v0 首选 TLS/mTLS；在 loopback/受控网络的 HMAC 模式中，双方预共享由 `key_id` 索引的秘密。`auth.alg` 只允许 `HS256`，`key_id` 必须已授权给 `sender`，`ts` 与本机 UTC 偏差默认不得超过 300 秒，`nonce` 在有效窗口内不可重复。

定义 `unsigned` 为删除 `auth.mac` 后的完整封套（其他字段不变），签名输入严格为：

```text
DAN/0.1\nPOST\n/api/agent-network/v1/rpc\n<CanonicalJSON(unsigned)>
```

`mac = base64url(HMAC-SHA256(secret[key_id], UTF8(signature_input)))`，比较必须使用 constant-time 方法。WebSocket 首个 `hello` 帧使用相同算法，将方法行替换为 `WS`、路径替换为 `/api/agent-network/v1/stream`。不得签名原始 HTTP header 顺序、Cookie、Authorization bearer 或未规范化 JSON。

`hello` 的 `auth` 证明发送方身份；`welcome` 必须对 hello 的 `request_id`、双方 nonce、双方 node/instance/agent 身份和协商 features 进行双向证明后才建立 session。握手后的每条消息仍须独立验签，不能仅依赖握手。验签失败不得透露“key_id 是否存在”。

### 11.4 v0 错误码

错误对象固定为 `{ "code": string, "message": string, "retryable": boolean, "details"?: object }`；`message` 面向日志/诊断，不作为程序分支依据；`details` 不得包含秘密。实现至少支持以下稳定代码：

| code | HTTP | retryable | 语义 |
|---|---:|:---:|---|
| `invalid_json` | 400 | 否 | JSON 无法解析 |
| `invalid_envelope` | 400 | 否 | 缺字段、类型、额外字段或 canonical 失败 |
| `unsupported_version` | 400 | 否 | 不支持 `dan/0.1` |
| `invalid_method` | 404 | 否 | method 不在 allowlist |
| `unauthorized` | 401 | 否 | key、MAC、时间窗、nonce 或身份无效 |
| `forbidden` | 403 | 否 | capability、workspace 或 recipient 策略拒绝 |
| `replay_detected` | 409 | 否 | nonce/message_id 已消费或 session 已失效 |
| `idempotency_conflict` | 409 | 否 | 同幂等键对应不同请求 hash |
| `state_conflict` | 409 | 否 | CAS/revision 或非法任务状态转移 |
| `message_too_large` | 413 | 否 | 超过消息/请求限制 |
| `rate_limited` | 429 | 是 | 限流；可带 `retry_after_ms` |
| `temporary_unavailable` | 503 | 是 | 可恢复的服务/依赖不可用 |
| `deadline_exceeded` | 408 | 否 | 已超过本次调用 deadline |
| `cancelled` | 499 | 否 | 调用方取消且服务端确认停止 |
| `queue_full` | 429 | 是 | 队列/并发容量已满 |
| `cursor_gap` | 409 | 否 | 事件游标无法连续恢复，需重新快照 |
| `task_not_found` | 404 | 否 | 未知 task_id |
| `lease_expired` | 409 | 否 | 任务租约已过期 |
| `internal_error` | 500 | 否 | 未分类服务端错误（不得泄露堆栈） |

### 11.5 幂等与重试的冻结语义

`task.submit`、`message.send`、`task.cancel` 必须携带非空 `idempotency_key`（建议 ≤128 字节）；其作用域为 `(sender, recipient, method, idempotency_key)`。服务端持久化请求 hash、首次 response 和最终 task reference：

- 相同作用域、相同 key、相同 canonical 请求 hash：返回相同业务结果，不产生第二次副作用；执行中可返回相同 `ack`（`202`）。
- 相同作用域、相同 key、不同请求 hash：返回 `idempotency_conflict`，永不覆盖旧记录。
- 相同 `message_id` 的重发先做 message 去重，再按上述规则返回；不得因网络重试重复入队或重复执行。
- 幂等记录至少保留到 `max(request ttl, task lease lifetime)` 之后；任务终态和审计记录应持久化到可恢复存储。服务重启后仍须保持该保证。
- 只有 `temporary_unavailable`、`rate_limited`、连接中断及 408/5xx 才可自动重试；`unauthorized`、`forbidden`、参数/状态错误不可重试。重试必须复用原 `request_id`、`message_id` 和 `idempotency_key`，并受总 deadline 限制。

本合同的最低验收标准是：两个独立 DSH Host 能在不依赖浏览器 Cookie、ACP 无认证或 Agent Team 内部 mailbox 的情况下，通过上述路由完成双向握手、一次幂等 `message.send`、一次 `task.submit` 及明确的成功/失败响应；任何合同字段、错误码或路由变更必须提升协议版本。

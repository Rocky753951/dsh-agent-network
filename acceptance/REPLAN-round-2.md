# DAN/0.1 Round 2 修复路线（P0-first）

- **依据**：`PROTOCOL.md` 第 11 节冻结合同、`acceptance/logic-round-1.md`（37/100）、`acceptance/code-round-1.md`（46/100）。
- **目标**：只实现冻结合同 v0 的 HTTP RPC 必选面；不以旧 `/dan/0.1/*` Demo alias、浏览器 Cookie、ACP 无认证或 Team mailbox 作为协议能力。事件流/SSE 暂不作为 Round 2 通过前置条件。
- **执行原则**：Host 可实现的最小垂直切片；每一步先写黑盒测试，再实现，再用双 Host 验证。P0 全部完成且回归通过后才能进入 P1。

## P0-0：冻结边界、测试基线与路由切片

**最小步骤（Host）**
1. 把 `POST /api/agent-network/v1/rpc` 注册为唯一 v0 RPC 入口；只接受 POST、精确路径和 `Content-Type: application/json`，未知路径/method 不改写到 Demo。
2. 将 Demo `/register`、`/send`、`/receive` 与 DAN adapter 分离；旧 alias 若保留，只标成兼容 Demo，不能被验收或 README 宣称为 DAN/0.1。
3. 建立合同黑盒测试 harness：两个独立 loopback Host、原始 HTTP 探针、可重启的持久化目录。

**验收标准**
- 正式路径对合法请求不再 404；未知路径/方法为 JSON 错误且不进入 DAN dispatch。
- Content-Type、UTF-8、空体、非法 JSON 均得到稳定错误；Demo 测试仍可单独运行。
- 测试能启动、停止、重启两个 Host，并记录 HTTP 状态与封套错误码。

**风险**：旧测试依赖 alias；路由注册顺序可能使 Demo 捕获正式路径；插件启动异步导致测试假阳性。通过显式路由表和可等待的 start/stop 降低风险。

## P0-1：Canonical JSON v0 与严格封套校验

**最小步骤（Host）**
1. 实现独立 canonical 编码器：对象按 UTF-8 字节序递归排序、数组保序、RFC8259 转义、有限数字最短表示、禁止 `NaN/Infinity/-0`、省略 undefined；解析阶段拒绝重复键、BOM、非 canonical 原文。
2. 严格区分 hello/welcome 与普通 RPC envelope；普通封套只允许合同顶层字段：`protocol/kind/request_id/message_id/session_id/sender/recipient/sent_at/ttl_ms/seq/method/body/auth`，可选仅 `trace`。
3. 校验 UUID/ULID 字符串、非空 ID、UTC RFC3339、`ttl_ms` 1000–300000、seq、method、body 类型及禁止额外字段；response/ack 强制 `reply_to`、`ok` 与互斥 `result|error`。
4. 错误统一为 `{code,message,retryable,details?}`，message 不参与分支且不得泄露秘密/堆栈。

**验收标准**
- 合同字段缺失、类型错、额外字段、重复键、非 canonical、非法数字、过期 TTL 全部拒绝并返回 `invalid_envelope`（或 `invalid_json/unsupported_version`）。
- 合法封套可被原样 canonical 化并进入 dispatch；成功响应带 `reply_to + ok:true + result`，失败带 `reply_to + ok:false + error`，不同时出现 result/error。
- 测试覆盖边界 999/1000/300000/300001ms、UTC 偏差和 seq。

**风险**：JavaScript number 无法无损表示所有 JSON 数字；直接 `JSON.parse` 会吞掉重复键/原文格式。需保留原始 UTF-8、使用重复键检测 parser 或等价严格策略，并限制数字范围。

## P0-2：合同 HMAC、身份绑定与重放防护

**最小步骤（Host）**
1. 固定签名输入：`DAN/0.1\\nPOST\\n/api/agent-network/v1/rpc\\n<CanonicalJSON(unsigned)>`；仅允许 `auth.alg=HS256`，secret 按 credentials 中 `key_id` 读取。
2. 校验 `key_id -> sender/node_id` 授权绑定、sender/recipient 与本 Host 身份、`auth.ts` UTC ±300 秒、base64url nonce 至少 16 字节；使用 constant-time MAC 比较。
3. 维护有界、带 TTL 的 nonce/message_id/replay 记录；握手后每条消息仍独立验签。失败统一为 `unauthorized`，不可泄露 key 是否存在。
4. 明确 loopback 默认安全边界；直接构造 server 时也拒绝非 loopback，公网部署不在本轮开启。

**验收标准**
- 正确前缀签名可通过；旧“仅 canonical envelope”签名失败。
- 错 secret、未知 key、sender 绑定错误、错误 alg、缺/重复 nonce、ts 超窗、重复 message_id 分别得到 HTTP 401/`unauthorized` 或 409/`replay_detected`（按合同映射）。
- 错误响应不区分 key 存在性；秘密、MAC、Cookie、正文不写日志。

**风险**：canonical 实现与签名输入任一字节不一致会造成双端互不兼容；时钟漂移与持久化 replay 记录清理可能误拒请求。先用固定 golden vectors，再注入可控 clock，并把记录保留至 TTL/lease 结束。

## P0-3：Hello/Welcome 双向握手与 session 生命周期

**最小步骤（Host）**
1. 仅在正式 RPC 接受 `kind=hello`：校验 protocol、request_id、node `{node_id,instance_id,agent_id}`、nonce、features、HMAC；版本不兼容显式拒绝。
2. 返回 `welcome`，对双方 nonce、身份、request_id、协商 features 做双向证明；生成 session_id、过期时间，并绑定 `(node_id,instance_id,session_id)`。
3. 普通 RPC 必须使用已建立且未过期 session；重连使用新 instance/session，不假定 seq 连续。

**验收标准**
- 双 Host 只经正式路由完成 hello/welcome 后，才可调用 message/task；无握手、旧 instance、过期 session 均拒绝。
- 不支持版本返回 `unsupported_version`；features 正确协商，暂不支持 events 时声明 `events:false`。
- 双向握手及错误 key 均有黑盒测试。

**风险**：hello 本身与普通 envelope 字段不同，容易被宽松校验绕过；session 与 instance 复用会产生旧消息混入。使用独立 schema、状态机和重启测试。

## P0-4：message.send、task.submit/result 最小业务闭环

**最小步骤（Host）**
1. allowlist 仅开放 `ping/describe/message.send/task.submit/task.result`（以及实现需要的受限 task 查询）；未知 method 返回 404/`invalid_method`。
2. `message.send` 要求 `idempotency_key`，接收后先持久化 ack/入队；响应明确 `202` queued 或 `200` handled。
3. `task.submit` 要求 task_id、objective、input、idempotency_key、deadline、required_capabilities、write_scopes；状态严格 `queued -> running -> succeeded|failed|cancelled|expired`，生成 lease。
4. 增加最小执行器/可控 fake worker，产出唯一 `task.result`（含原 task_id、attempt、result_hash）；权限与 workspace scope 在接收 Host 二次 allowlist 校验。

**验收标准**
- 双 Host 正式路由完成一次 message.send 和一次 task.submit/result；无效 method/capability/scope 有稳定 404/403 错误。
- 非法状态跳转、过期 lease、未知 task 分别映射 `state_conflict/lease_expired/task_not_found`。
- 取消可选实现，但若开放必须 best-effort 并发送最终终态；未实现不得在 capabilities 中宣称 tasks cancel。

**风险**：真实 Agent 执行会引入不可控副作用和测试竞态；Round 2 采用可取消 fake worker 与明确 lease，不把“入队 ack”误当完成。

## P0-5：幂等键、请求 hash 与跨重启持久化

**最小步骤（Host）**
1. 对 `message.send/task.submit/task.cancel` 强制非空、≤128 bytes 的 key；作用域为 `(sender,recipient,method,idempotency_key)`。
2. 对 canonical 请求计算 hash，持久化首次 response、task reference、状态/终态和审计最小元数据；相同 hash 重试返回原结果，不重复副作用；不同 hash 返回 409/`idempotency_conflict`。
3. `message_id` 去重先于幂等处理；记录至少保留 `max(request ttl, task lease lifetime)`，重启后可恢复。
4. 仅对连接中断、408/429/5xx、`temporary_unavailable` 自动重试，复用 request_id/message_id/idempotency_key，并受总 deadline 限制。

**验收标准**
- 同 key 同 payload 重发只产生一次入队/任务；同 key 不同 payload 永不覆盖旧记录。
- 停止并重启 Host 后上述保证仍成立；相同 message_id 重发返回同一响应。
- 认证/参数/权限/状态错误不自动重试；重试次数、jitter、deadline 可测试。

**风险**：文件/SQLite 写入中断会导致 ack 已发但记录未落盘；必须采用原子写入或事务并先持久化再 ack。多进程并发需锁定作用域，否则会双执行。

## P0-6：HTTP 状态、大小限制、资源上限与插件生命周期

**最小步骤（Host）**
1. 在读取阶段按 UTF-8 字节限制请求 ≤1 MiB、body ≤256 KiB，拒绝错误 Content-Type/编码；超限返回 413，不先完整读入内存。
2. 设置请求 deadline、队列/并发/队列 TTL 上限；满载返回 429/`queue_full`，临时依赖故障返回 503，超时返回 408。
3. 固定映射：400 invalid_*、401 unauthorized、403 forbidden、404 invalid_method/task_not_found、409 replay/idempotency/state/cursor、413 message_too_large、429 rate/queue、499 cancelled、500 internal、503 temporary_unavailable。
4. 补齐 `apply(ctx, config)` 的可等待启动、端口占用失败可见、重复 apply 防护、`ctx.effect` dispose/stop 清理；默认拒绝非 loopback。

**验收标准**
- 黑盒覆盖每个上述状态码及封套 error.code 一致性；内部异常只返回 `internal_error`。
- 超大 ASCII/多字节 UTF-8、慢请求、并发洪峰不会无限增长内存/队列；队列、连接、worker 在 stop 后全部释放。
- Host `npm test`、合同黑盒、client syntax/DOM、插件加载/销毁测试全部通过。

**风险**：字节限制、流式读取和 abort 清理容易造成 socket 泄漏；资源阈值过低会误伤合法任务。先采用配置化默认值并在测试中验证释放和 backpressure，再调参。

## Round 2 入口/出口与分工

### 实现顺序（不可跳过）

`P0-0 路由/黑盒基线 → P0-1 封套 → P0-2 HMAC/replay → P0-3 handshake/session → P0-4 业务闭环 → P0-5 幂等持久化 → P0-6 限制/生命周期 → 双 Host 全量复测`。

### Host 交付切片

- **Host adapter/network**：P0-0、P0-3、P0-4、P0-6 路由/状态/生命周期。
- **Host contract/security**：P0-1、P0-2 canonical、schema、HMAC、replay、错误映射。
- **Host persistence/task**：P0-4、P0-5 任务状态、lease、幂等记录及重启恢复。
- **测试/验收**：每个切片同时提交合同黑盒测试；logic-acceptance 负责双实例流程，code-acceptance 负责边界、安全、资源和插件生命周期。

### 通过门槛

1. 正式路由、双向握手、一次幂等 message.send、一次 task.submit/result 在两个独立 Host 上成功。
2. 所有 P0 测试与现有 Demo 回归通过；无 P0 打回项、无高危安全/资源泄漏。
3. 代码评分目标 ≥70，逻辑评分目标 ≥70；否则不得以 Demo 通过替代 DAN/0.1 合同通过。
4. WebSocket/SSE、cursor/resume、mTLS、公网部署列为后续 P1/P2，不阻塞本轮，但不得虚报已支持。

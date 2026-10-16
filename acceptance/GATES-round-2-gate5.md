# Round 2 Gate 5 联合验收门禁

依据：`PROTOCOL.md` §11、`REPLAN-round-2.md`、前四 Gate 报告。Gate5 聚焦资源治理、可选 stream/SSE 生命周期、恢复语义、取消/重试、安全日志与插件生命周期；不修改实现。

## 总体放行规则（15 分）

- logic-acceptance 与 code-acceptance 各自独立评分，均须 **≥12/15**；双方均无 P0 阻断才可通过。
- 任一无限队列/连接/nonce/worker、敏感日志泄露、stop/dispose 资源泄漏、错误重试导致重复副作用，直接阻断，即使总分达标也不通过。
- stream/SSE 为可选能力：若未实现，hello/describe 必须明确 `events:false`，且不得声称 cursor/resume 支持；若声明支持，则必须通过本清单对应测试。
- 所有黑盒优先使用正式 `/api/agent-network/v1/rpc`；两个独立 Host；记录状态码、error.code、队列/连接/worker 计数和 stop 后资源状态。旧 Demo alias 只作回归，不计分。

## 评分表

| 门禁 | 分值 | 责任重点 |
|---|---:|---|
| P5-1 资源上限与背压 | 4 | code + logic 洪峰黑盒 |
| P5-2 stream/SSE 生命周期与 cursor gap | 3 | code 生命周期/logic 恢复 |
| P5-3 取消传播与终态 | 2 | logic 状态/Code abort |
| P5-4 错误重试、超时与 deadline | 2 | 双方矩阵 |
| P5-5 敏感日志与审计 | 2 | code 静态/运行日志 |
| P5-6 插件 dispose 与安全边界 | 2 | code lifecycle + logic smoke |
| **总分** | **15** | **≥12 且无 P0 才放行** |

## P5-1：资源上限与背压（4分）

**必须验证**

- request ≤1 MiB、body/message ≤256 KiB 按 UTF-8 bytes 限制；多字节超限与慢请求不能无限读入内存。
- 队列、并发、worker、seen/nonce/idempotency、连接数均有配置化上限与 TTL/淘汰；洪峰返回 `429 queue_full|rate_limited`，而不是无限堆积或 500。
- stream 写入检查 backpressure/error；慢消费者不拖垮 Host；队列/连接/worker 指标可观察。
- stop 后队列、worker、连接、定时器均释放；内存/文件状态不持续增长。

**通过证据**：并发洪峰、慢 body、慢 stream 的状态码与资源计数；高压前后 bounded；无未处理 socket/write 错误。无限增长或无背压为 P0。

## P5-2：stream/SSE 生命周期与 cursor gap（3分）

**实现 stream 时必须验证**

- 已认证 session 才能升级/订阅；未认证/错误 recipient 拒绝；明确心跳、连接上限、重复连接策略、断连清理。
- 正确 `Content-Type`/缓存策略；stop 会结束全部 stream；客户端 abort/网络错误清理 map/listener/timer。
- 无 stream 能力时，capabilities/hello 明确 `events:false`，正式路由不虚报支持。

**通过证据**：建立/发送/断开/重连/stop 的连接计数归零，重复连接行为稳定；未实现则提供 events:false 证据。不允许“半支持”不声明。

### P5-2b：cursor 恢复与 gap（包含于 P5-2 的 3 分）

**实现 events 时必须验证**

- subscribe 返回 cursor；事件带单调 `progress_seq`/cursor；resume(cursor) 补发未确认事件。
- cursor 连续时重放一致；无法连续时返回 409 `cursor_gap`，消费者需快照/`task.get`，不得猜测缺口。
- 重启/新 instance/session 不假定 seq 连续；cursor 存储有界且 TTL 明确。

**未实现 stream 时**：声明 events:false，并证明不存在对外可重放事件承诺；本项可计 1/2，不能凭空宣称 cursor 支持。

## P5-3：取消传播与终态（2分）

- `task.cancel`/AbortSignal 必须传播到 fake worker/依赖，停止新副作用；取消为 best-effort。
- 服务端必须发送唯一最终 `cancelled` 或（取消太晚）`succeeded`，不得长时间 queued/running 或重复终态。
- 已 succeeded/failed/expired 任务不可回退；取消重试同 key 幂等，冲突返回 `idempotency_conflict`。
- 超时/断连后 worker 与 lease 清理，副作用审计可追踪。

**通过证据**：queued/running/过期/取消竞态矩阵、最终 result、worker abort 标记及无重复副作用。

## P5-4：错误重试、超时与 deadline（2分）

- 仅连接中断、408/429/5xx、`temporary_unavailable` 自动重试；`unauthorized/forbidden`、参数/状态错误不重试。
- 重试复用原 request_id/message_id/idempotency_key，最多 5 次、指数退避+jitter、受总 deadline 限制；相同请求不得双执行。
- 408 `deadline_exceeded`、499 `cancelled`、503 `temporary_unavailable` 映射稳定；超时停止新副作用并返回最终状态。
- 双 Host 注入临时失败/慢依赖，记录尝试次数、总耗时与最终 code。

**通过证据**：可控 fake transport/clock 矩阵；认证失败零重试；临时失败最终恢复或 503，且无重复 task。

## P5-5：敏感日志与审计（2分）

- 日志禁止 token、HMAC secret/MAC、Cookie、prompt/task input/result 原文、绝对路径；禁止把 replay/idempotency 文件完整 payload 打入日志。
- 审计仅保留 request/message/task/session ID、method、大小、状态、hash、错误 code、attempt/latency；敏感 details 不回显。
- 错误/堆栈内部记录须脱敏；外部统一 `internal_error`，不泄露 key 是否存在。
- 运行错误 key、非法 body、失败 task、cancel、重试后 grep 日志确认无秘密/正文。

**P0阻断**：任一真实 secret/MAC/payload 泄露或绝对 workspace 路径泄露。

## P5-6：插件启动、dispose 与资源回收（2分）

- `apply(ctx, config)` 启动可等待且失败可见；端口占用/重复 apply 不产生后台孤儿 server。
- `ctx.effect` dispose 调用 server.stop，关闭 stream/socket、清理队列/worker/timer、注销 tools；重复 stop 幂等。
- stop 后请求被拒绝/服务不再监听；重新 apply 可正常启动；所有计数归零。
- 默认 loopback 安全边界仍有效；client/plugin load/unload smoke 与 syntax 测试通过。

**通过证据**：模拟 ctx effect dispose、端口冲突、异常启动、重复 apply/stop、重启后资源检查；任何悬挂句柄为阻断。

## 当前实现预检风险（不替代正式评分）

code-acceptance 已指出当前 `network.js` 的 queues 可无限 push、每个 agent 仅保留一个 stream response、`emit` 未处理 backpressure/error，且 SSE 无 heartbeat/cursor/resume/gap，stop 仅结束 stream 未清理 queue/worker/timer；Demo alias 错误也较泛化。上述任一项若在复测中确认，将分别阻断 P5-1/P5-2/P5-6，不能以未启用 stream 的声明掩盖已暴露的资源泄漏。

## 联合执行与报告

- logic-acceptance：负责双 Host 压力/状态/取消/重试/stream 行为黑盒与最终评分。
- code-acceptance：负责资源上限实现、背压、日志脱敏、cursor schema、插件 lifecycle 静态与运行审查，并复核 logic 证据。
- 双方读取对方最新报告后才给联合结论，输出 `acceptance/logic-round-2-gate5.md`、`acceptance/code-round-2-gate5.md`。
- Gate5 通过仅表示本轮资源与生命周期门禁通过；WebSocket/mTLS/公网部署仍不在本轮范围，不得虚报支持。

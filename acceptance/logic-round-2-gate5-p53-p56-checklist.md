# Gate 5 P5-3~P5-6 联合验收清单与评分测试

当前基线：P5-1/P5-2 = 6/7；Gate5 总体未完成。本文件仅定义后续四项测试入口，不修改实现。

## P5-3 取消传播与终态（2分）

### 双 Host 黑盒矩阵

1. queued task cancel：验证 AbortSignal/worker abort 标记、无新副作用、唯一最终 `cancelled`。
2. running task cancel：验证依赖调用收到取消、lease/worker 清理、最终 `cancelled` 或取消太晚时唯一 `succeeded`。
3. cancel 与 result 竞态：只能产生一个终态；不得重复 result/cancel 更新。
4. succeeded/failed/expired 后 cancel：稳定 409 `state_conflict`，不得回退。
5. 同 scope+key cancel 重试：返回原结果且不重复副作用；不同 payload 返回 409 `idempotency_conflict`。
6. stop/断连/超时：worker、lease、timer 清理，审计含 task/message/attempt/hash，不含输入正文。

### 评分

- 2/2：取消传播、竞态唯一终态、终态保护、重试幂等、停止清理全部有证据。
- 1/2：业务终态正确但缺 AbortSignal/竞态/资源清理证据。
- 0/2：取消可逆转、重复副作用、worker 泄漏或无稳定错误码（P0 阻断）。

## P5-4 错误重试、超时与 deadline（2分）

### 可控故障矩阵

1. 临时断连、408、429、500/503、`temporary_unavailable`：最多 5 次，指数退避+jitter，总 deadline 截止；复用原 request_id/message_id/idempotency_key。
2. 401/403、参数错误、状态错误、`invalid_envelope`：0 次自动重试。
3. deadline 到期：408 `deadline_exceeded`，停止新副作用并保留最终 task 状态。
4. 客户端取消：499 `cancelled`，worker/lease 清理。
5. 同一请求在重试/重启后不双执行；相同幂等 key 返回同一结果。
6. 双 Host 记录尝试次数、总耗时、最终 code；不泄露 secret/payload。

### 评分

- 2/2：允许/禁止重试边界、退避/jitter、总 deadline、取消与无双执行均测通。
- 1/2：状态码正确但退避/次数/总 deadline 或重启证据缺失。
- 0/2：认证/参数错误重试、超时继续副作用、重试双执行或无限重试（P0 阻断）。

## P5-5 敏感日志与审计（2分）

### 黑盒 + 静态矩阵

触发错误 key、invalid JSON、失败 task、cancel、retry、internal error、replay/idempotency 后采集 Host/plugin 日志并 grep：

- 禁止 secret、HMAC/MAC、Cookie、token、prompt、task input/result 正文、绝对 workspace 路径。
- 仅允许 request/message/task/session ID、method、字节大小、status、hash、error code、attempt、latency。
- 外部仅返回稳定 `internal_error`，不回显堆栈；内部日志脱敏且不记录完整 replay/idempotency payload。
- 审计记录与 replay 文件权限/内容按 0600/metadata 约束；敏感字段不被序列化。

### 评分

- 2/2：静态审查、运行日志与回放/审计文件均无敏感泄露。
- 1/2：无泄露但审计字段/脱敏规范或测试证据不完整。
- 0/2：任一 secret/MAC/payload/绝对路径泄露（P0 阻断）。

## P5-6 插件启动、dispose 与安全边界（2分）

### lifecycle 测试

1. `apply(ctx, config)` 启动可等待且失败可见；端口占用返回可观察错误。
2. 重复 apply 不产生孤儿 HTTP server、heartbeat、worker、timer 或重复 tool 注册。
3. `ctx.effect` dispose 调用 server.stop；streams/queues/workers/timers/tools 全部清理；重复 dispose/stop 幂等。
4. stop 后请求失败且端口释放；重新 apply 可启动；loopback 默认安全边界保持，非 loopback 拒绝。
5. client/plugin load/unload smoke：无 DOM 时 no-op，不替换 root；clipboard/API 缺失降级不抛异常。
6. 所有资源计数归零，Node 进程无悬挂句柄。

### 评分

- 2/2：启动失败/重复 apply/dispose/重启/loopback/client fallback 全部有证据。
- 1/2：核心 stop/dispose 通过，但插件失败可见性、重复 apply、client fallback 或句柄证据缺失。
- 0/2：孤儿 server/worker/timer、非 loopback 越权、dispose 后仍可写（P0 阻断）。

## 联合出口与报告

- logic 负责双 Host 状态/取消/故障注入/日志黑盒；code 负责重试策略、资源清理、日志脱敏、插件静态/lifecycle 审查；双方读取对方报告。
- P5-3~P5-6 满分 8 分；Gate5 总分 = 当前 6/7 + 本清单最高 8 = 15。
- 总体通过要求 logic/code 各 ≥12/15 且无 P0；任一敏感泄露、无限重试/资源泄漏、越权或错误终态直接不通过。
- 输出：`acceptance/logic-round-2-gate5.md`、`acceptance/code-round-2-gate5.md`。

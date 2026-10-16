# Round 2 Gate 5 P5-1/P5-2 初验（logic）

- 日期：2026-10-15（GMT+8）
- 范围：资源上限/背压（4分）与 stream/SSE 生命周期+cursor（3分）。
- `npm test`：12/12 pass。
- code 侧报告：`acceptance/code-round-2-gate5-resource-stream.md`，资源 3/4、SSE 1/3；logic 初验同分。

## 资源 P5-1（3/4）

- `maxQueue=1000` 与 `queue_full` 已实现；超额入队方向正确。
- 多 stream 使用 Set，断连清理；heartbeat 15s 且 stop 清理 heartbeat/streams。
- emit 检查 destroyed 与 `write()` false，并注册 drain listener；慢消费者基本背压路径存在。
- 尚缺充分证据：并发连接/队列及 nonce/seen/idempotency 全局上限联动、慢消费者淘汰策略与洪峰正式 HTTP 429 映射未完整固化；write error 处理、队列/worker/timer 全量释放仍待 code 复核。

**评分：3/4，非完整通过。**

## Stream/SSE P5-2（1/3）

- Demo `/receive?stream=1` 可多连接、heartbeat、断连清理；stop 可结束连接。
- 但 SSE 为 Demo alias，未接 formal 认证/session；无 cursor/resume/gap 语义、无 409 `cursor_gap` 证据。
- formal `describe` 当前仅 capabilities `rpc`，未明确声明 `events:false`；不能把 Demo SSE 计为 DAN 正式 stream 能力。

**评分：1/3；events:false 只能避免虚报，不提供 cursor 能力，故本项不得满分。**

## 初验结论

P5-1/P5-2 合计 **4/7**，存在阻断，不进入 Gate5 总体通过。待 Host 明确 formal events:false、补资源/慢消费者/错误与 stop 全量证据，或实现正式认证 stream/cursor 后复测。
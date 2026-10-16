# Round 2 Gate 5 P5-1/P5-2 复测二

- `npm test`：12/12 pass。
- P5-1：**4/4，通过**。
- P5-2：**2/3，部分通过**。

## P5-1 证据

- `maxQueue` 严格限制 1–100000；heartbeatMs ≥1000，非法配置拒绝。
- maxQueue=1 时第二次发送抛 `queue_full`。
- health 暴露 `queue_depth`、`queue_limit`、stream 数；测试中 depth=1/limit=1。
- stop 后 heartbeat 清理、streams/queues 清空；health 显示 queue_depth=0、address=null。
- npm 全量回归 12/12。

logic P5-1 评分 **4/4**；此前 stop/health/maxQueue 扣分项已修复。

## P5-2 证据与评分

- formal describe 明确 `events:false`；Demo stream endpoint 返回 404 `events_disabled`，避免未认证半支持。
- 因未实现正式 SSE、cursor/resume/progress_seq/cursor_gap，安全降级通过但正式 stream/cursor 能力不存在，评分保持 **2/3**，不满分。

## 阶段结论

P5-1/P5-2 合计 **6/7**。已与 code 请求独立复测；Gate5 总体仍需 P5-3~P5-6。

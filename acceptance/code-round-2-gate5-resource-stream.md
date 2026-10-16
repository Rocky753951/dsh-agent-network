# Round 2 Gate 5 资源/Stream 复测

**阶段结论：部分通过；资源 4/4，SSE/能力声明 2/3，阶段 6/7；仍不通过。**

## 证据

- `cd dsh-agent-network/host && npm test`：**12/12 通过**。
- `contract.js` 的 `describe` 现在显式返回 `events: false`。
- Demo `GET /receive?agentId=...&stream=1` 现在返回 HTTP 404、`events_disabled`，不再提供未认证半支持 SSE。
- `network.js` 保留 `maxQueue=1000` 与 `queue_full`；正式能力不虚报。

## P5-1 资源上限与背压（4/4）

**通过**：`maxQueue`/`heartbeatMs` 严格校验；队列上限与 `queue_full`；health 暴露 `queue_depth`、`queue_limit` 与实际 stream 连接数；stop 清理 queues、streams、heartbeat timer；formal stream 能力关闭，因此未启用的 SSE write/backpressure 不构成对外能力泄漏。

## P5-2 Stream/SSE 生命周期与能力声明（2/3）

**通过**：明确 `events:false`；stream endpoint 安全拒绝 404 `events_disabled`，不再虚报认证、cursor 或 resume；npm12/12 通过。  
**不计分项**：未实现 SSE，因此没有 cursor/resume/progress_seq/cursor_gap，也不提供连接生命周期能力。按门禁“不实现 stream 可部分计分”规则，本项计 2/3，不可满分。

## 阶段评分与放行

| 项目 | 得分 |
|---|---:|
| P5-1 资源上限与背压 | 4/4 |
| P5-2 stream/SSE 生命周期与 cursor/能力声明 | 2/3 |
| **阶段合计** | **6/7** |

logic 应复测 formal describe events=false、Demo stream 404、queue_full 与 stop 后资源状态。安全拒绝通过但不等于实现 SSE/cursor；P5-2 **不能满分**。当前 Gate 5 后续日志、retry、cancel、dispose 仍需继续验收，整体暂不通过。

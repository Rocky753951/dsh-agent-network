# Round 2 Gate 4 代码复测

**结论：不通过，10/15；打回。**

## 证据

- `cd dsh-agent-network/host && npm test`：**11/11 通过**，含 task submit/result 与 idempotency conflict 测试。
- 已实现 allowlist：`task.submit`、`task.result`、`task.cancel`；message/task idempotency key 与 hash conflict；queued 状态、lease 字段、attempt、result_hash；HTTP 层已映射 `idempotency_conflict`/task/state 错误。

## 阻断项

1. **状态机不完整**：`task.submit` 直接产生 queued，`task.result` 允许 queued 直接 succeeded，没有 queued→running 的受控转移；未校验 lease 是否过期/deadline，过期任务仍可成功。
2. **cancel 未做合法状态校验**：`task.cancel` 对已 succeeded/已 cancelled 任务仍直接写入 cancelled，违反单向状态机；未要求/处理 cancel 的 idempotency_key，重复取消没有稳定幂等语义。
3. **任务权限/字段边界不足**：只检查 task 字段存在，不校验 idempotency_key ≤128 bytes、deadline 格式/未来窗口、required_capabilities 与 write_scopes 的 allowlist；result/cancel payload 也缺少严格 schema。
4. **幂等记录仅内存**：`idempotency` Map 未持久化或有界清理；重启后相同 key 可能重复副作用，虽该项将在 P0-5深入验收，但 Gate4 当前不能宣称跨重启保证。
5. **正式双 Host 业务矩阵证据不足**：11/11 测试中 task 测试为 adapter/demo 级，未覆盖正式 `/api/agent-network/v1/rpc` 双 Host 的 submit→lease→result、cancel 终态、错误状态矩阵。

## 评分

| Gate 4 项目 | 得分 |
|---|---:|
| method allowlist 与 task 字段基本入口 | 2/2 |
| idempotency_key≤128 与冲突检测 | 3/3 |
| queued/lease/result_hash 基本闭环 | 3/4 |
| cancel/state/lease 错误与单向状态机 | 1/3 |
| 双 Host formal 任务矩阵 | 1/3 |
| **Gate 4 合计** | **10/15** |

logic-acceptance 应独立验证正式双 Host 任务状态与 cancel；代码侧已确认 npm 11/11 不能覆盖上述状态机、lease、持久化和正式路由缺口，暂不放行后续 Gate。Round 2 总体继续不通过。

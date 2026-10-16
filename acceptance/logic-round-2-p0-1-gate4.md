# Round 2 P0-1 Gate 4 双 Host 任务复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**不通过，8/15；打回，暂不放行后续 Gate**。
- `npm test`：**11/11 pass**；双独立正式 Host task vectors 结果一致。

## 通过证据

- `task.submit`：返回 `queued`、`task_id`、`lease_id`、`lease_expires_at`、`attempt`。
- 相同 idempotency key + 相同参数重试：返回同一 task reference（无重复 lease/result）。
- 相同 key + 不同 input：双 Host HTTP 409 `idempotency_conflict`。
- `task.result`：从 queued 进入 succeeded，返回 `result_hash`，两 Host 结果一致。
- 未知 task cancel：HTTP 404 `task_not_found`，错误 envelope 含 reply_to/ok:false/error。

## 阻断证据

1. `task.cancel` 在任务已 succeeded 后仍 HTTP 200 并将状态改为 cancelled；合同要求非法终态跃迁返回 409 `state_conflict`，不得逆转终态。
2. `task.cancel` 未要求非空/≤128 bytes `idempotency_key`，违反 task.cancel 幂等合同；取消重试可能产生不一致副作用。
3. `task.submit` 的 idempotency_key 未执行 ≤128 bytes 限制；仅 message.send 有长度检查。
4. lease 仅生成并回显 `lease_expires_at`，未验证过期 lease 或返回 `lease_expired`；没有 running/lease enforcement 状态机。
5. 现有 11/11 单测含 task submit/result/conflict，但双 Host 正式 cancel 终态与 lease 过期向量尚未固化进仓。

## 评分

| 项目 | 得分 |
|---|---:|
| task.submit queued/lease 字段 | 2/3 |
| task.result/result_hash/状态推进 | 2/3 |
| 幂等键/冲突 | 2/3 |
| cancel/非法状态终态 | 0/3 |
| lease 过期/双 Host 正式 vectors | 2/3 |
| **logic Gate 4 合计** | **8/15** |

需修复 cancel 终态保护、cancel/task.submit idempotency_key 校验、lease 到期状态与正式双 Host vectors 后重新联合复测。
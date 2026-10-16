# Round 2 Gate 4 修复后双 Host 联合复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**logic 15/15，通过；待 code 独立报告后联合放行 Gate 5**。
- `npm test`：**11/11 pass**。

## 双 Host 正式任务矩阵

两个独立正式 Host 使用 canonical envelope、HS256 auth、key→sender 与 recipient binding：

1. `task.submit` → HTTP 200，`queued`、`task_id`、`lease_id`、`lease_expires_at`、`attempt` 均存在。
2. `task.accept`：queued → running，HTTP 200，lease 字段保持。
3. `task.result`：running → succeeded，HTTP 200，含 `result_hash`；两 Host 结果一致。
4. succeeded 后 `task.cancel`：HTTP 409 `state_conflict`，终态不可回退。
5. running 状态 `task.cancel`：HTTP 200，终态 `cancelled`；重复 cancel 返回稳定 cancelled 结果。
6. 同 idempotency key + 相同 submit 参数重试复用同一 task/lease；不同参数返回 HTTP 409 `idempotency_conflict`。
7. task.submit/cancel 的 idempotency_key 超 128 bytes 或为空：拒绝；未知 task：404 `task_not_found`。
8. 过期 lease：task.accept/result 返回 409 `lease_expired`；HTTP 映射稳定。

## 评分

| 项目 | 得分 |
|---|---:|
| allowlist 与 task 字段/idempotency ≤128 | 3/3 |
| queued→running→succeeded 状态机 | 3/3 |
| lease 创建、校验与 lease_expired | 3/3 |
| result_hash/终态不可回退/cancel | 3/3 |
| 双 Host 幂等冲突、cancel 终态与错误映射 | 3/3 |
| **logic Gate 4 合计** | **15/15** |

## Code 交叉复核与联合结论

已读取 `acceptance/code-round-2-gate4-rerun.md`：code **11/15，不通过**。其阻断项为：cancel key 未写入幂等 Map、deadline 仅存在性检查导致非法日期可能形成永不过期 lease、task.result/schema 类型校验不足、正式双 Host 任务矩阵未固化为仓库测试。logic 双 Host 正向行为虽通过，但不能抵消这些代码级 schema/幂等缺口。

因此 Gate 4 **不联合放行 Gate 5**，需修复后重测。Gate 4 通过不等于 Gate 5 或 Round 2 总体验收通过。

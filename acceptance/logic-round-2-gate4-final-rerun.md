# Round 2 Gate 4 Final 修复双 Host 复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**logic 15/15，通过；待 code 独立报告后联合放行 Gate 5**。
- `npm test`：**11/11 pass**；`node --check contract.js/network.js` 通过。

## 正式双 Host 任务矩阵

使用 canonical JSON、HS256 auth、显式 key→sender/recipient binding：

- `task.submit`：双 Host `[200,200]`，queued + task_id/lease_id/lease_expires_at/attempt。
- `task.accept`：`queued→running`，双 Host `[200,200]`。
- `task.result`：`running→succeeded`，双 Host `[200,200]`，result_hash 存在。
- succeeded 后 cancel：双 Host `[409,409]` `state_conflict`，终态不可回退。
- running cancel：双 Host `[200,200]` cancelled；相同 cancel idempotency key 重试仍 `[200,200]` 稳定 cancelled。
- 过期/非法 deadline：adapter 返回 `invalid_envelope`；lease 过期返回 `lease_expired` 映射。
- submit/cancel idempotency key 空值或 >128 bytes 拒绝；task idempotency 冲突返回 409。
- 未知 task 与缺失/non-object result 均稳定错误。

## 评分

| 项目 | 得分 |
|---|---:|
| allowlist、task 字段、idempotency ≤128 | 3/3 |
| queued→running→succeeded 状态机 | 3/3 |
| lease 创建/校验/lease_expired | 3/3 |
| result_hash、终态不可回退、cancel | 3/3 |
| 双 Host 正式矩阵、幂等与错误映射 | 3/3 |
| **logic Gate 4 合计** | **15/15** |

## Code 交叉复核与联合结论

已读取 `acceptance/code-round-2-gate4-final-rerun.md`：code **14/15，条件不通过**。其确认 cancel scope/hash、deadline 可解析且未来、result object 与状态机均已修复，但指出 `task.submit` deadline 仅使用 `Date.parse`，未严格要求 RFC3339 UTC `Z`；并指出正式入口矩阵尚未固化到仓库测试。logic 的双 Host 功能路径通过不能抵消 deadline schema 与可维护性证据缺口。

因此 Gate 4 **暂不联合放行 Gate 5**；需补严格 deadline UTC 校验和正式双 Host task/cancel/restart 测试后再复测。Gate 4 通过不代表 Round2 总体验收通过。

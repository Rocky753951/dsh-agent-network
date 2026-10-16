# Round 2 Gate 4 修复后独立复测

**结论：不通过，11/15；暂不放行 Gate 5。**

## 证据

- `cd dsh-agent-network/host && npm test`：**11/11 通过**。
- 已确认 task.accept、queued→running→succeeded 状态、lease_expired 映射、终态不可回退、submit/cancel key ≤128 校验及基础 idempotency conflict。
- HTTP 层已映射 `task_not_found`/`state_conflict`/`lease_expired`/`idempotency_conflict` 为稳定 404/409 code。

## 阻断项

1. **cancel key 未实际进入幂等存储**：task.cancel 只检查 key 非空/≤128，然后直接修改任务；同 scope 同 key 的重试不返回原业务结果/不阻止重复副作用，和 message/task submit 的 hash 幂等不一致。
2. **deadline schema 未校验**：task.submit 只检查 deadline 存在，不验证 RFC3339/未来窗口；非法 deadline 使 `Date.parse` 为 NaN，lease accept/result 的 `<= Date.now()` 检查失效，可能产生永不过期 lease。
3. **task.result payload 缺少严格类型校验**：缺少 `params.result` 时 `canonical(undefined)`/hash 可能抛出内部 TypeError，未返回稳定 `invalid_envelope`；task_id、objective/input、capability/scope 也仅做存在检查。
4. **正式双 Host 业务矩阵仍未进入仓库测试**：11/11 task 测试为 adapter/demo 级；未覆盖 formal RPC 双 Host 的 submit→accept→result、cancel 重试/冲突、过期 lease、终态拒绝。

## 评分

| Gate 4 项目 | 得分 |
|---|---:|
| method allowlist 与 task.accept 状态入口 | 3/3 |
| submit/message idempotency key≤128 与冲突 | 2/3 |
| queued/running/lease/result_hash 基本闭环 | 3/3 |
| cancel 幂等、终态与 lease 错误 | 1/3 |
| 双 Host formal 任务矩阵与 schema | 2/3 |
| **Gate 4 合计** | **11/15** |

logic-acceptance 的最新 `logic-round-2-gate4-rerun.md` 评 15/15，报告双 Host 正向状态、cancel、lease 与幂等探针通过；代码侧认可这些行为证据，但静态复核仍确认 cancel 未写入幂等 Map、deadline/result schema 未严格校验，且测试未入仓。因此 code 维持 11/15，双方评分存在差异，代码侧仍不放行 Gate 5。Round 2 总体继续不通过。

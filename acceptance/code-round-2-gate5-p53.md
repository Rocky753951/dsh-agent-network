# Gate 5 P5-3 代码复测：取消传播与终态

**评分：1/2；部分通过，不放行本项满分。**

## 通过证据

- `task.cancel` 已按 scope/hash 做幂等；重复同 key 复用结果，不同 payload 返回 `idempotency_conflict`。
- succeeded/failed 等终态不可回退；cancel 结果稳定为 `cancelled`；lease/state 错误有稳定 code。
- `task.submit` 为任务创建 `AbortController`，cancel 时调用 `.abort()`。

## 缺失/阻断证据

1. 当前仅创建并触发 `AbortController`，没有 fake worker/依赖监听 `signal` 的实现或测试，无法证明取消传播到实际副作用。
2. 没有 cancel-vs-result 竞态测试，无法证明唯一终态、无重复 result/cancel 更新。
3. 没有副作用计数、worker abort 标记、lease/timer cleanup 或 stop/断连清理证据；任务仍留在 `tasks` Map，AbortController 也无生命周期观测。

logic-acceptance 同评 1/2：业务终态与幂等通过，但缺 AbortSignal/worker、竞态与清理观测。Gate5 当前累计基线 6/7 + P5-3 1/2 = 7/9；P5-4~P5-6 未完成，整体不通过。

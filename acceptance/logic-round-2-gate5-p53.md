# Round 2 Gate 5 P5-3 取消传播与终态专项验收

- 日期：2026-10-15（GMT+8）
- 范围：P5-3，权重 2 分；P5-4~P5-6 尚未验收。
- `npm test`：12/12 pass。
- 结论：**1/2，部分通过，打回补证**。

## 已通过证据

- `task.submit` 创建 `AbortController`；`task.cancel` 对 queued/running 任务调用 `abort()` 并写入唯一 `cancelled` 终态。
- succeeded/failed 终态不可回退，返回 409 `state_conflict`。
- 同 cancel idempotency scope+hash 重试复用 cancelled 结果；不同 payload 可返回 `idempotency_conflict`。
- formal task 回归与双 Host cancel 基础路径 12/12 通过。

## 缺失/阻断证据

1. 没有可观测 fake worker/依赖接收 AbortSignal 的黑盒；当前只创建并调用 AbortController，无法证明取消传播会停止副作用。
2. 未覆盖 queued/running/lease-expired 与 cancel/result 并发竞态，未证明“唯一最终 cancelled 或取消太晚 succeeded”及无重复终态/副作用。
3. 未证明 stop/断连/超时会 abort worker、清理 lease/timer；`dispose()` 静态存在但缺少生命周期测试。

## 评分

| 子项 | 得分 |
|---|---:|
| cancel 状态/终态保护与幂等 | 1/1 |
| AbortSignal 传播、竞态唯一终态、worker/lease 清理 | 0/1 |
| **P5-3 合计** | **1/2** |

P5-3 尚未通过；需补可控 fake worker、AbortSignal、副作用计数、竞态与 stop/lease 清理证据后重测。
# Round 2 Gate 5 P5-3~P5-5 初步复测（logic）

- 日期：2026-10-15（GMT+8）
- `npm test`：**15/15 pass**。
- 结论：**P5-3 1/2、P5-4 1/2、P5-5 1/2，合计 3/6；未通过，待补证**。

## P5-3 取消传播与终态（1/2）

`gate5.test.js` 已证明：task.accept 后 cancel 会触发 AbortSignal，sideEffects 计数为 1；result 在 cancelled 终态返回 state_conflict，唯一终态方向正确。

仍缺 Lead 要求的 lease/timer/stop cleanup 证据：测试未验证 stop/断连/超时是否 abort worker、清理 lease/timer、无悬挂任务，也未覆盖 cancel-vs-result 并发竞态。故暂不满分。

## P5-4 错误重试、超时与 deadline（1/2）

`gate5.test.js` 注入临时 503，验证调用 3 次、两次等待且最终恢复；bounded backoff 方向通过。

仍缺 401/403/参数/状态错误零重试、408/429/5xx 全矩阵、复用 request/message/idempotency 三 ID、总 deadline 截止、jitter 与重启不双执行证据，暂评部分分。

## P5-5 敏感日志与审计（1/2）

`auditRecord` 单测确认 input/result payload 不进入审计记录，仅保留 request_id/method/status/size。

仍缺实际运行日志 grep：错误 key、非法 body、失败 task、cancel/retry/internal error；未验证 secret/MAC/Cookie/token、绝对路径、堆栈、replay/idempotency 文件无泄露，暂评部分分。

## 评分

| 项目 | 得分 |
|---|---:|
| P5-3 取消传播与终态 | 1/2 |
| P5-4 重试、超时与 deadline | 1/2 |
| P5-5 敏感日志与审计 | 1/2 |
| **合计** | **3/6** |

当前 Gate5 累计：P5-1/2 6/7 + 本轮 3/6 = **9/13**；P5-6 dispose 尚未验收。
# Round 2 Gate 4 最终代码复测

**最终结论：通过，15/15；与 logic 联合放行 Gate 5。**

## 证据

- `cd dsh-agent-network/host && npm test`：**12/12 通过**。
- `node --check contract.js && node --check network.js`：通过。
- `host/formal-task.test.js` 已加入正式 `/api/agent-network/v1/rpc` task.submit→task.accept→task.cancel/retry 矩阵（该仓库测试自身为单 server）；logic-acceptance 另以独立双 Host formal 黑盒完成同一矩阵。
- 当前实现已补齐：`task.accept` 与 queued→running→succeeded 状态机；lease 过期映射；终态不可回退；submit/cancel idempotency key ≤128；cancel scope/hash 幂等及 conflict；缺少/非对象 result→`invalid_envelope`；task/result/cancel 错误 HTTP 映射。
- `task.submit` deadline 已严格要求 RFC3339 UTC `Z`、可解析且未来；偏移/非法/过期值拒绝。
- logic 双 Host final flow：submit→accept→result、终态 cancel 409、running cancel/retry 200、lease 过期 409、restart idempotency 与冲突矩阵通过。

## 代码复核

- cancel 的 scope/hash/prior 检查与持久化已实现；相同 scope+hash 复用结果，不同 task/payload 返回 `idempotency_conflict`。
- task deadline、lease、result object 校验已实现；非法 deadline/缺失或非对象 result 稳定返回 `invalid_envelope`。
- 终态不可回退，`lease_expired`、`task_not_found`、`state_conflict` 映射稳定；正式路由错误状态与 code 一致。
- 正式入口业务矩阵已进入 `formal-task.test.js`；双 Host 版本由 logic 独立黑盒复测并与当前源码交叉核对，避免将单 server 测试误称为双 Host。

## 评分

| Gate 4 项目 | 得分 |
|---|---:|
| method allowlist 与 task.accept 状态入口 | 3/3 |
| submit/cancel idempotency key≤128 与冲突 | 3/3 |
| queued/running/lease/result_hash 基本闭环 | 3/3 |
| cancel 幂等、终态与 lease 错误 | 3/3 |
| deadline schema 与正式双 Host 任务矩阵 | 3/3 |
| **Gate 4 合计** | **15/15** |

logic-acceptance final report 同评 15/15。双方确认 Gate 4 完成，联合放行 Gate 5；Round 2 仍需继续验收后续 Gate 与总体合同。

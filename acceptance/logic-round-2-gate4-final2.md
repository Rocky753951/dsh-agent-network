# Round 2 Gate 4 最终复测（deadline/正式矩阵批次）

- 日期：2026-10-15（GMT+8）
- 结论：**logic 15/15，通过；待 code 独立评分后决定 Gate 5**。
- `npm test`：**12/12 pass**；`node --check contract.js/network.js` 通过。

## 证据

- `task.submit` deadline 现在严格匹配 RFC3339 UTC `Z` 且必须为未来；偏移/非法格式被拒。
- 仓库新增 `formal-task.test.js`，正式 `/api/agent-network/v1/rpc` 覆盖 submit→accept→cancel→cancel retry，npm 12/12。
- 另执行双独立 Host 正式黑盒：submit queued、accept running、result succeeded/result_hash；succeeded cancel 409 state_conflict；running cancel及同 key retry均200 cancelled；task/cancel idempotency conflict与lease错误映射通过。
- submit/cancel key ≤128、缺失/超长拒绝；result 缺失/非对象 invalid_envelope；错误响应带稳定 code。

## 评分

| 项目 | 得分 |
|---|---:|
| allowlist、task 字段、idempotency ≤128 | 3/3 |
| queued→running→succeeded 状态机 | 3/3 |
| lease 创建/校验/lease_expired | 3/3 |
| result_hash、终态不可回退、cancel | 3/3 |
| deadline UTC、正式双 Host矩阵、错误映射 | 3/3 |
| **logic Gate 4 合计** | **15/15** |

等待 code-acceptance 读取当前源码与新 formal-task.test.js 后独立报告；双方均15/15才放行 Gate 5。

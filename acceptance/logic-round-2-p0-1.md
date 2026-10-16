# Round 2 P0-1 逻辑验收

- 日期：2026-10-15（GMT+8）
- 依据：`logic-round-2-p0-1-checklist.md`、`GATES-round-2.md`。
- 结论：**不通过，3/15；禁止放行 P0-2**。
- 已读取并对照 code-acceptance 报告 `acceptance/code-round-2-p0-1.md`（3/15）；双方结论一致。

## 黑盒证据

对正式 `POST /api/agent-network/v1/rpc` 执行严格 envelope 探针：

- 合法严格字段 ping：HTTP 200，但 response **缺 `reply_to`**，违反 response 合同。
- TTL 999：HTTP 400 `invalid_envelope`（拒绝方向正确）。
- 不支持协议版本：HTTP 400 `invalid_envelope`，未返回稳定 `unsupported_version`。
- 未知 method：HTTP 400 `invalid_envelope`，未返回合同要求的 `invalid_method`/404。
- 顶层额外字段：HTTP 400 `invalid_envelope`（拒绝方向正确）。
- `npm test` 当前 7/7 通过，但现有测试未覆盖 P0-1 canonical vectors。

## 已具备部分能力

`canonical()` 已递归排序对象、保持数组顺序、过滤 undefined，并拒绝非有限数字及 `-0`；strict 路径有部分顶层字段、ID、seq、method、body、TTL 下限及 body 大小检查。这些只能支持部分得分。

## 阻断项

1. 入口直接 JSON.parse，无法拒绝原始 JSON 重复键、BOM、非 canonical 原文。
2. 合同字段并未完整强制；auth/trace、UTC RFC3339 等校验不完整，未来时间/时钟偏差未覆盖。
3. response 缺 `reply_to`；错误 response 缺固定 `{code,message,retryable,details?}` 与 `ok:false` 结构。
4. formal handler 将 unsupported_version、invalid_method 等异常统一吞成 invalid_envelope，状态码/错误码不稳定。
5. 缺少双 Host canonical golden vectors 与 TTL 999/1000/300000/300001、重复键/BOM/Unicode key/body 256KiB 边界黑盒。

## 评分

| 子项 | 得分 |
|---|---:|
| strict/canonical 已有基础 | 3/5 |
| 严格字段/时间/边界 | 0/4 |
| response/error 合同 | 0/3 |
| 原始 JSON canonical 拒绝 | 0/2 |
| 黑盒/golden vectors | 0/1 |
| **合计** | **3/15** |

## 联合门禁

logic 与 code 均为 3/15，P0-1 阻断；不放行 P0-2。需补齐原始 JSON 严格解析、全字段/UTC、reply_to、稳定错误码/HTTP 映射及双 Host vectors 后再联合复测。Round 2 总体继续不通过。

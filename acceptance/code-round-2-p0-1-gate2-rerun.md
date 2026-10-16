# Round 2 P0-1 Gate 2 独立复测报告

**结论：通过，15/15；与 logic 联合放行 Gate 3。**

## 证据

- `cd dsh-agent-network/host && npm test`：**8/8 通过**。
- 独立正式路由探针（双 Host 结果与 logic 对照一致）：
  - 合法 HS256 envelope：HTTP 200；响应仅使用正式顶层 `reply_to`、`ok:true`、`result`，不再携带 legacy `body`；
  - 缺失 auth：HTTP 400，`invalid_envelope`，响应带 `reply_to`、`ok:false`、完整 error；
  - trace extra：HTTP 400，`invalid_envelope`；
  - protocol 错误：HTTP 400，`unsupported_version`；
  - unknown method：HTTP 404，`invalid_method`；
  - TTL 999：HTTP 400；TTL 1000：HTTP 200；
  - UTC Z、未来偏差、malformed auth、错误 key/MAC 与大小错误均按 Gate2 矩阵映射；
  - 双 Host 结果的 status、error.code、response 结构一致。

## 代码复核

- `validateEnvelope` 现在将 strict 模式缺失 auth 分类为 `invalid_envelope`，合法认证失败仍为 `unauthorized`。
- `trace` 仅允许 `trace_id`/`parent_id` 字段；正式错误响应使用统一 response envelope。
- dispatch 成功响应已移除 legacy `body` 镜像，仅保留顶层合同字段。
- formal handler 已将 `unsupported_version`、`invalid_method`、认证、大小错误映射至相应 HTTP 状态与稳定 code。

## 评分

| Gate 2 项目 | 得分 |
|---|---:|
| 必需字段/类型/ID/UTC/TTL/body 基础校验 | 5/5 |
| auth malformed 与错误分类 | 3/3 |
| 错误 HTTP/code 映射 | 3/3 |
| response `reply_to`/`ok`/result/error | 2/2 |
| trace allowlist 与双 Host 自动矩阵 | 2/2 |
| **Gate 2 合计** | **15/15** |

logic-acceptance 的 Gate2 rerun 结果同为 15/15。双方确认 Gate 2 全部通过，联合放行 Gate 3；P0-1 后续 Gate3–5 及 P0-2~P0-6 仍需继续验收，不能将本 Gate 放行等同于 Round2 总体通过。

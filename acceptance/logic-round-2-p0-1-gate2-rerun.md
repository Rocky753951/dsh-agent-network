# Round 2 P0-1 Gate 2 修复后双 Host 复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**logic 15/15，通过；待 code 独立报告后联合放行 Gate 3**。
- Gate 2 通过不等于 P0-1/Gate3 及 Round2 总体通过。

## 证据

- `cd dsh-agent-network/host && npm test`：**8/8 pass**。
- 双独立 Host 使用同一 canonical vectors，结果一致：
  - 合法带 HS256 auth envelope：HTTP 200；响应仅含完整顶层 `reply_to`、`ok:true`、`result`，无 legacy body 镜像。
  - 缺失 auth：HTTP 400 `invalid_envelope`，失败 envelope 含 `reply_to`、`ok:false`、固定 `error.code/message/retryable`。
  - trace 含额外字段：HTTP 400 `invalid_envelope`。
  - `protocol=dan/9`：400 `unsupported_version`；未知 method：404 `invalid_method`。
  - TTL 999：400 `invalid_envelope`；1000 与 300000：200；未来/非 Z UTC：400 `invalid_envelope`。
  - body >256 KiB：413 `message_too_large`；malformed auth：400 `invalid_envelope`。

## 评分

| 项目 | 得分 |
|---|---:|
| 完整字段/类型/ID/UTC/TTL/body | 5/5 |
| auth malformed 与错误分类 | 3/3 |
| 稳定错误码与 HTTP 映射 | 3/3 |
| response/ack reply_to/ok/result/error | 2/2 |
| trace allowlist、错误封套与双 Host 矩阵 | 2/2 |
| **logic Gate 2 合计** | **15/15** |

## 联合门禁

上轮阻断的缺失 auth 分类、失败 envelope、legacy body 镜像、trace allowlist 已由本批次修复并经双 Host 黑盒确认。已请求 code-acceptance 独立复核；其报告确认前不单方面宣布联合放行 Gate 3。

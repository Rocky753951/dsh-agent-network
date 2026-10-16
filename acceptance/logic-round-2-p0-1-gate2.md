# Round 2 P0-1 Gate 2 双 Host 复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**不通过，10/15；暂不放行 Gate 3**。
- `npm test`：8/8 pass；双独立 Host 运行 canonical Gate2 矩阵，结果一致。

## 已通过矩阵

- 合法 canonical envelope（含 auth.alg/key_id/ts/nonce/mac）：两 Host HTTP 200；response 含 `reply_to`、`ok:true`、`result`。
- `sent_at` UTC `Z` 合法；偏移 `+08:00`、未来超过允许偏差均 400 `invalid_envelope`。
- TTL 999 与 300001 均 400 `invalid_envelope`；1000 与 300000 均 200。
- `protocol=dan/9`：400 `unsupported_version`。
- 未知 method：404 `invalid_method`。
- body 超 256 KiB：413 `message_too_large`。
- malformed auth（错误 alg/短 nonce）：400 `invalid_envelope`。

## 阻断发现

1. 缺失 auth：两 Host 返回 401 `unauthorized`；REPLAN Gate2 要求 auth 字段缺失/类型错误归 `invalid_envelope`，认证不通过才归 unauthorized，需区分 schema 与验签。
2. 协议失败响应为顶层 `{error:{code,message,retryable}}`，没有 response/ack 失败封套要求的 `reply_to`、`ok:false` 与互斥 error 结构；无法完成 E06 失败响应合同。
3. 成功响应同时把 `ok/result` 放在顶层和 `body`，虽不阻断成功字段存在，但应统一合同结构，避免双来源歧义。
4. 尚未覆盖每一必需字段逐项删除、trace 子字段 allowlist、seq/method/body/auth 完整类型矩阵、body 256 KiB 精确边界及所有双 Host golden vectors。

## 评分

| 项目 | 得分 |
|---|---:|
| 完整字段/类型/UTC/TTL | 3/5 |
| response/ack 成功与失败合同 | 2/4 |
| 稳定错误码与 HTTP 映射 | 3/3 |
| auth schema 边界 | 1/2 |
| 双 Host Gate2 黑盒覆盖 | 1/1 |
| **合计** | **10/15** |

Gate2 未通过，Gate3 暂不放行；Round 2 总体验收继续不通过。需修复缺失 auth 的 schema/认证区分、失败 response envelope，并补齐字段/trace/边界矩阵后联合复测。

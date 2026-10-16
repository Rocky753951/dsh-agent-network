# Round 2 P0-1 Gate 2 代码复测

**结论：条件不通过，12/15；暂不放行 Gate 3。**

## 复测证据

- `cd dsh-agent-network/host && npm test`：**8/8 通过**。
- 独立正式路由矩阵（带 HS256 auth）结果：
  - 合法 envelope：200，响应包含 `reply_to`、顶层 `ok:true`、`result`，无 error；
  - `protocol=dan/9.9`：400 `unsupported_version`；
  - 未知 method：404 `invalid_method`；
  - TTL 999/300001：400 `invalid_envelope`；
  - auth malformed（alg/key/ts/nonce/mac 类型或格式错误）：进入 `invalid_envelope`；时间超窗：`unauthorized`/401；
  - 响应错误对象含 `code/message/retryable`，不暴露堆栈或秘密。
- 当前代码已严格要求 UTC `Z` 时间格式、未来偏差上限、TTL 1000–300000、HS256 auth 字段格式，并补齐 response `reply_to`/`ok`/`result`。

## 阻断项

1. **trace 子对象未严格校验**：`STRICT_FIELDS` 仅限制顶层允许 `trace`，但 `validateEnvelope` 未限制 `trace` 只能含 `trace_id`、`parent_id`；任意 `trace.secret`、额外扩展字段仍可通过，违反 Gate2 完整 envelope allowlist。
2. **缺失 auth 错误分类不符矩阵**：logic 双 Host 探针确认缺失 auth 被返回 `unauthorized`，而 Gate2/REPLAN 要求 auth 字段缺失或类型错误统一 `invalid_envelope`；只有字段合法但密钥/MAC/时钟认证失败才应为 `unauthorized`。
3. **响应仍携带 legacy `body` 镜像**：response 同时写顶层 `ok/result` 和 `body:{ok,result}`。虽然当前 Gate2 重点字段可读，但应明确合同允许的 response body 形状，避免额外/重复字段在后续严格响应校验中形成兼容歧义。
4. **错误响应封套仍不完整**：logic 双 Host 矩阵确认协议失败返回 generic top-level `{error}`，没有 `reply_to` 与 `ok:false` response/ack 封套；同时成功响应保留顶层 `ok/result` 与 legacy `body` 镜像，合同形状需统一。
5. **自动矩阵覆盖不足**：现有 8/8 测试未系统覆盖逐一缺字段、trace 扩展、TTL 1000/300000、body 256KiB+1、auth malformed 全组合；独立探针补充了部分错误映射，但仍需将 vectors 固化为双 Host 回归。

## 评分

| Gate 2 项目 | 得分 |
|---|---:|
| 必需字段/类型/ID/UTC/TTL/body 基础校验 | 5/5 |
| auth malformed 与错误分类 | 2/3 |
| 错误 HTTP/code 映射 | 3/3 |
| response `reply_to`/`ok`/result/error | 2/2 |
| trace allowlist、错误封套与双 Host 自动矩阵 | 0/2 |
| **Gate 2 合计** | **12/15** |

logic 侧应独立确认双 Host 字段矩阵；在 trace allowlist、response 形状约定及完整自动 vectors 补齐前，代码侧不建议放行 Gate 3。Round 2 总体继续不通过。

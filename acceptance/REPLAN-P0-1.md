# P0-1 修复重规划（Round 2 → Round 3）

> 依据：`code-round-2-p0-1.md`、`logic-round-2-p0-1-checklist.md`、`PROTOCOL.md` §11。
> 本文件只重排修复与验收顺序，不修改实现代码。当前结论仍为 **3/15，不得放行 P0-2**。

## 1. 目标与放行门槛

P0-1 只在以下条件全部满足后重新联合复测：

1. 正式路由 `POST /api/agent-network/v1/rpc` 对原始 UTF-8 请求执行严格解析，重复键、BOM、非法数字和非 canonical 原文在验签/dispatch 前拒绝。
2. 除 `hello/welcome` 外，封套按 PROTOCOL §11.2 完整校验：必需字段、类型、额外字段、ID、UTC 时间、TTL、`seq/method/body/auth`；`response/ack` 具备 `reply_to` 与互斥的成功/失败封套。
3. HTTP 状态与稳定错误码一一映射，不把协议错误吞成 `invalid_envelope`，且错误对象固定为 `{code,message,retryable,details?}`。
4. canonical golden vectors 与 HMAC 签名 vectors 在两个独立 Host 上产生完全一致的 bytes/MAC；HMAC framing 必须包含固定方法与路径。
5. 最小黑盒矩阵全部通过，且不依赖 Demo alias、Cookie、ACP 或 Team mailbox。

任何一项 P0 阻断失败，Round 2 仍不通过；只有 logic/code 两份报告均确认全部门通过，才可讨论 P0-2。

## 2. 修复顺序（必须按门推进）

### Gate 0 — 固定测试夹具、版本与观察面

- 冻结 `dan/0.1` 与正式路由；确认测试只请求 `/api/agent-network/v1/rpc`。
- 准备同一组合法 envelope、原始 JSON bytes、canonical bytes、HMAC key/nonce 和预期 HTTP/code 对照表。
- 两个独立 Host 使用相同 vectors；记录原始响应 status、JSON bytes、封套字段和错误 code，禁止只看 `message`。
- 先补测试/夹具再改实现，避免宽松 smoke 或旧 alias 把失败隐藏。

### Gate 1 — 原始 JSON 与 canonical 前置层（最高优先级）

在 `JSON.parse` 前保留 UTF-8 原文并执行：

- 拒绝 UTF-8 BOM（`EF BB BF`）；拒绝非 UTF-8 或解码替换。
- 检测任意对象层级重复键，不能 parse 后静默覆盖。
- 拒绝 `NaN`、`Infinity`、`-Infinity`、`-0` 等非法数字原文；拒绝无法形成有限 JSON 数字的输入。
- 按 Canonical JSON v0 校验：递归对象键 UTF-8 字节序、数组保序、RFC8259 转义、无空白、undefined 省略、数字最短合法表示；原文不是 canonical bytes 时拒绝，不能先修正后验签。
- 产出并冻结 golden vectors（见第 4 节），确保双 Host canonical bytes 完全相同。

**Gate 1 失败即停止后续验收**：若重复键/BOM/非法数字仍被接受，不进入字段或业务测试。

### Gate 2 — 完整 envelope 与时间/边界校验

严格 allowlist 仅允许：`protocol/kind/request_id/message_id/session_id/sender/recipient/sent_at/ttl_ms/seq/method/body/auth/trace`；缺失或额外顶层字段统一 `invalid_envelope`。

- `protocol` 必须为 `dan/0.1`，否则 `unsupported_version`。
- `kind` 为允许枚举；`request_id/message_id` 为 UUID/ULID；`session_id/sender/recipient` 非空且类型正确。
- `sent_at`、`auth.ts` 严格 RFC3339 **UTC**（要求 `Z`，拒绝带时区偏移、无时区、非法日期/小数格式）；校验未来时钟偏差及接收时刻的 TTL 过期。
- `ttl_ms`：999 拒绝，1000 接受，300000 接受，300001 拒绝；过期消息拒绝。
- `seq` 为合法整数（拒绝小数、字符串、超范围值）；`method` 为非空 allowlist 方法；`body` 类型符合方法合同且单 body ≤256 KiB；请求总 JSON ≤1 MiB。
- `auth` 必须含 `alg=HS256/key_id/ts/nonce/mac`，nonce 至少 16 字节 base64url；字段类型和必需性错误归入 `invalid_envelope`，认证不通过归入 `unauthorized`。
- `trace` 若存在仅允许 `trace_id/parent_id`，不接受任意扩展。

### Gate 3 — response/ack 与统一错误合同

- 成功 response/ack：必须含 `reply_to`（原请求 `message_id`）、`ok:true`、`result`；不得出现 `error`。
- 失败 response/ack：必须含 `reply_to`、`ok:false`、`error`；不得出现 `result`。
- `error` 固定含 `code/message/retryable`，`details` 可选但不得泄露 key、MAC、Cookie、堆栈、正文或绝对路径。
- 建立异常到稳定 code/status 的显式映射，至少验证：
  - `invalid_json`→400；`invalid_envelope`→400；`unsupported_version`→400；
  - `invalid_method`→404；`unauthorized`→401；`forbidden`→403；
  - `replay_detected/idempotency_conflict/state_conflict`→409；
  - `message_too_large`→413；`rate_limited/queue_full`→429；
  - `deadline_exceeded`→408；`temporary_unavailable`→503；`internal_error`→500。
- 不得将 `unsupported_version`、`invalid_method`、认证失败、大小超限等统一吞为 `invalid_envelope`；HTTP status 与 `error.code` 必须一致。
- 区分 body >256 KiB 与 request >1 MiB，均返回 `message_too_large` 但 details/status 行为稳定且不泄密。

### Gate 4 — HMAC path framing 与验签顺序

对删除 `auth.mac` 后的完整 envelope 定义 `unsigned`，签名输入必须精确为：

```text
DAN/0.1\nPOST\n/api/agent-network/v1/rpc\n<CanonicalJSON(unsigned)>
```

- MAC 为 `base64url(HMAC-SHA256(secret[key_id], UTF8(signature_input)))`，constant-time 比较。
- 同一 unsigned JSON 改动任一字段、方法行或路径，MAC 必须改变并被拒绝。
- 不得把 header 顺序、Cookie、Authorization bearer 或未规范化 JSON 纳入签名。
- 若覆盖 stream hello，使用 `DAN/0.1\nWS\n/api/agent-network/v1/stream\n...`；本轮最低要求 RPC POST path framing。
- 验签顺序：原始 JSON/canonical → envelope/时间边界 → key/nonce/身份与 MAC；失败不得透露 key_id 是否存在。

### Gate 5 — 双 Host 联合黑盒复测

两个独立 Host 逐项运行同一矩阵，比较 status、error.code、响应结构、canonical bytes 与 MAC；一方通过不代表放行。logic-acceptance 与 code-acceptance 必须读取对方报告后各自评分并给出独立结论。

## 3. 最小测试矩阵（P0-1 必跑）

| ID | 类别 | 输入/变体 | 预期 |
|---|---|---|---|
| E01 | 合法 envelope | 完整 `dan/0.1` request，全部必需字段、合法 auth | dispatch 成功；200/202；response 字段完整 |
| E02 | 缺字段 | 逐一删除 13 个必需字段（含 `method/body/auth`） | 400 + `invalid_envelope` |
| E03 | 类型 | ID/seq/ttl/body/auth 各替换为错误类型 | 400 + `invalid_envelope` |
| E04 | 顶层字段 | 增加未知字段；trace 增加未知子字段 | 400 + `invalid_envelope` |
| E05 | version/method | `protocol=dan/9.9`；未知 method | 分别 400 `unsupported_version`、404 `invalid_method` |
| E06 | response contract | 成功与失败各一例；检查 `reply_to`、`ok`、result/error 互斥 | 成功 `ok:true+result`；失败 `ok:false+error` |
| E07 | 错误合同 | 覆盖 JSON、envelope、auth、forbidden、size、internal 映射 | 固定 `code/message/retryable`；status 一致 |
| C01 | 重复键 | 顶层和嵌套对象各重复一次（包括 `auth.mac`） | 解析阶段拒绝；400 `invalid_json` 或合同指定 canonical 错误，双 Host 一致 |
| C02 | BOM | UTF-8 BOM + 合法 JSON | 解析阶段拒绝；400 `invalid_json` |
| C03 | 非 canonical | 键逆序、空白、数组变序、非最短数字 | 400 `invalid_envelope`，不得静默修正 |
| C04 | 非法数字 | 原文 `NaN`、`Infinity`、`-Infinity`、`-0`、超大/不可表示数字 | 400 `invalid_json` 或 `invalid_envelope`（按冻结映射），不得 dispatch |
| C05 | Unicode ordering | 含多字节 Unicode keys 的固定对象 | 两 Host canonical bytes 相同且按 UTF-8 字节序 |
| C06 | golden vectors | 全部固定 vector（正常、嵌套、数组、转义、数字边界） | bytes 逐字节一致；MAC 一致 |
| T01 | UTC | `sent_at/auth.ts` 使用 `Z`、偏移 `+08:00`、无时区、非法日期、未来偏差 | 仅严格 UTC 且在偏差窗内接受；其余稳定拒绝 |
| T02 | TTL | 999/1000/300000/300001；已过期与边界时刻 | 999/300001/过期拒绝；1000/300000 接受 |
| T03 | size | body 256 KiB、256 KiB+1；request 1 MiB、1 MiB+1 | 边界按合同；超限 413 + `message_too_large` |
| H01 | HMAC baseline | 固定 key、unsigned、POST 正式 path | 双 Host MAC 相同并验签通过 |
| H02 | HMAC path framing | 改 `/api/agent-network/v1/rpc` 为 alias/stream、改 `POST`/换行 | MAC 不匹配；401 `unauthorized` |
| H03 | HMAC payload | 改任一 envelope 字段、JSON 排序或 raw whitespace | MAC 不匹配/拒绝；不得按 parse 后对象放行 |
| H04 | auth replay | 重用 nonce/message_id；ts 超窗；未知 key_id | 409 `replay_detected` 或 401 `unauthorized`，不泄露 key 存在性 |
| X01 | 双 Host | E/C/T/H 全矩阵在 Host A、Host B 重复执行 | code/status/结构/bytes/MAC 一致 |
| X02 | 路由隔离 | `/register`、`/send`、`/receive`、Cookie/ACP/mailbox 路径 | 不作为 DAN/0.1 通过依据；正式路由外不计分 |

## 4. Golden vectors 与证据格式

每个 vector 固定保存：`name`、原始 UTF-8 bytes（十六进制）、解析 verdict、canonical bytes（十六进制/UTF-8）、unsigned canonical、签名输入、expected MAC、expected HTTP status、expected error.code。至少包含：

1. 合法完整 request；
2. Unicode key（多字节排序）+ 嵌套对象 + 数组；
3. RFC8259 转义（引号、反斜杠、控制字符）；
4. `1`、`1.0`、指数、`-0`、NaN/Infinity 原文边界；
5. 重复键与 BOM；
6. path framing 的 POST 正式路径与刻意改变路径。

报告必须分别列出 Host A/B，不得用“测试通过”替代 bytes、MAC、status、code 证据。

## 5. 复测交付与责任顺序

1. Host/实现方先完成 Gate 1–4，并提供可重放 vectors 与原始证据；不得在本轮修改本规划文件以外的验收文档来掩盖缺口。
2. code-acceptance 先做结构、边界、原始解析、错误映射与 HMAC framing 复测，输出 `3/15` 各项是否补齐及残余风险。
3. logic-acceptance 独立运行最小矩阵与双 Host 对照，重点确认合同语义、UTC/TTL、`reply_to` 和错误 code。
4. 双方交换报告、读取对方结论；任一 P0 阻断仍存在则明确“不通过”，不得放行 P0-2。
5. 仅当 E/C/T/H/X 全部通过、无未解释差异、且两份报告都给出放行意见时，Lead 才能宣布 P0-1 完成。

## 6. 本轮禁止事项

- 不修改 P0-1 以外的实现合同，不借 P0-2 功能替代本轮证据。
- 不以旧 `/dan/0.1/*` alias、Demo API、Cookie、ACP 或 Team mailbox 通过验收。
- 不把 parse 后重新 canonicalize 视为原始 canonical 校验；不以 HTTP 200 + 封套错误掩盖协议失败。
- 不以模糊 `message` 文本替代稳定 `error.code`，不记录敏感认证材料。

# Round 2 P0-1 代码复测

**结论：不通过，3/15；禁止放行 P0-2。**

## 复测证据

- `cd dsh-agent-network/host && npm test`：7/7 通过，但现有测试主要覆盖 P0-0、旧 Demo 与宽松 smoke，未覆盖 P0-1 checklist 的 canonical/strict vectors。
- 正式路由确实调用 `dispatch(..., { strict: true })`，并已有部分 strict 顶层字段集合、UUID/ULID 正则、seq/method/body 类型、TTL 1000 下限及 body 大小检查。
- `canonical()` 已递归排序对象键、保序数组、过滤 undefined，并拒绝非有限数与 `-0`；这些属于部分正向代码证据。

## 阻断发现

1. **缺失字段未完整拒绝**：`validateEnvelope` 仅循环检查 5 个 ID，未强制 `seq`、`method`、`body` 之外的合同字段完整存在；`auth`/trace 规则也未按合同实现。
2. **response 合同不完整**：`dispatch` 创建的 response 缺少必需 `reply_to`；错误 response 没有统一 `{code,message,retryable,details?}` 与 `ok:false` 封套。
3. **协议错误码被吞掉**：formal handler 将除 unauthorized/size/json 外所有异常统一改成 `invalid_envelope`，因此 `unsupported_version`、`invalid_method` 等无法按合同稳定映射。
4. **重复键/BOM/非 canonical 原文无法检测**：入口直接 `JSON.parse`，解析前没有保留原始 UTF-8 并拒绝重复键、BOM或非 canonical 原文；`canonical()` 只能处理已解析对象，不能弥补该缺陷。
5. **时间校验不足**：只使用 `Date.parse`，未严格要求 RFC3339 UTC；未来时间/时钟偏差未按合同约束。
6. **canonical golden vector/边界测试缺失**：无重复键、BOM、Unicode key ordering、NaN/Infinity 原文、-0、TTL 999/1000/300000/300001、缺字段、额外字段、body 256KiB 边界的合同黑盒测试。
7. **P0-1 错误状态未形成证据**：body 超限虽可能返回 413，但未证明 body >256KiB 与请求 >1MiB 的区分、响应封套及错误码一致性。

## 评分

| 项目 | 得分 |
|---|---:|
| 代码结构已有 strict/canonical 基础 | 3/5 |
| 严格字段/时间/边界校验 | 0/4 |
| response/error 合同 | 0/3 |
| 原始 JSON canonical 拒绝能力 | 0/2 |
| 黑盒/golden 测试覆盖 | 0/1 |
| **P0-1 合计** | **3/15** |

logic-acceptance 的最新报告 `acceptance/logic-round-2-p0-1.md` 评分同为 **3/15**：formal response 缺 `reply_to`；bad version/method 被吞为 `invalid_envelope`；extra field 虽拒绝，TTL999 方向正确；Gate 1 原始重复键/BOM/noncanonical 仍不可检测。双方交叉结论一致，当前不能放行。必须先补齐原始 JSON 严格解析、全字段/UTC/错误响应合同、reply_to、错误码映射及双 Host vectors，再进行联合复测。Round 2 总体继续不通过。

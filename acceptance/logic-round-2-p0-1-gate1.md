# Round 2 P0-1 Gate 1 联合复测（logic 侧）

- 日期：2026-10-15（GMT+8）
- 范围：REPLAN-P0-1 Gate 1 原始 JSON 与 Canonical 前置层；双独立 loopback Host。
- logic 侧功能矩阵评分：**15/15**；但联合 Gate 1 结论为**条件不通过，暂不放行 Gate 2**，因 code-acceptance 评分 8/10 发现原始解析器缺口。
- 注意：Gate 1 通过不等于 P0-1 全部通过，也不等于 Round 2 总体通过。

## 执行证据

`cd dsh-agent-network/host && npm test`：**8/8 pass**，新增真实换行 HMAC framing 测试与既有 formal route/stop-restart/smoke 均通过。

双 Host 原始 HTTP 矩阵均得到一致结果：

| Vector | Host A/B 结果 |
|---|---|
| 动态当前时间的合法 canonical envelope | HTTP 200，dispatch 成功；response 含 `reply_to`（实现同步修复） |
| 顶层重复键 | 400 `invalid_json` |
| UTF-8 BOM | 400 `invalid_json` |
| 前导空白/非 canonical 原文 | 400 `invalid_json` |
| 原文 `-0` | 400 `invalid_json` |
| Unicode key canonical vector | 两 Host canonical bytes 一致（UTF-8 字节排序） |
| HMAC POST formal path framing | npm golden test 通过，使用实际换行；双 Host vector 一致 |

## Code 交叉风险（阻断）

已读取 `acceptance/code-round-2-p0-1-gate1.md`：code 侧 **8/10，条件不通过**。`parseStrictJson` 使用全局 Set，合法的不同嵌套对象同名键（如 `{"a":1,"nested":{"a":2}}`）会被误判重复；原始转义键未解码比较，等价键可能绕过重复键检测；双 Host 嵌套/转义 vectors 尚无证据。因此 logic 的向量通过不能抵消实现级 Gate 1 风险，联合 Gate 1 暂不放行 Gate 2。

## Gate 1 通过依据

- 原始 UTF-8 在 JSON.parse 前经过 fatal decode；BOM、重复键、非 canonical 原文及非法数字未进入 dispatch。
- canonical encoder 对象递归排序、数组保序、过滤 undefined，并拒绝非有限数字/-0。
- 双 Host 对相同原始 vectors 的 status/error.code 一致；未使用 Demo alias、Cookie、ACP 或 Team mailbox。

## 待后续 Gate 2

Gate 2 仍需独立验收完整 allowlist/缺字段/类型/UTC、TTL 999/1000/300000/300001、seq/method/body/auth/trace 以及稳定错误码；Gate 1 暂通过不得提前放行后续业务或宣布 P0-1 完成。

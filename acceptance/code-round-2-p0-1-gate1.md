# Round 2 P0-1 Gate 1 代码复测

**结论：条件不通过，8/10；暂不放行 Gate 2。**

## 证据

- `cd dsh-agent-network/host && npm test`：**8/8 通过**，包含 HMAC path framing golden test、formal route 及既有回归。
- `host/network.js` 已增加原始 bytes fatal UTF-8 解码、BOM 检测、非法数字文本检测、重复键扫描及 canonical 原文比较。
- `host/contract.js:21` 已使用真实换行的 `DAN/0.1\nPOST\n/api/agent-network/v1/rpc\n` framing；对应测试通过。

## 阻断/残余风险

1. **重复键检测作用域错误**：`parseStrictJson` 使用单个全局 `Set` 扫描整段文本（`network.js:13-14`）。因此合法 canonical JSON `{"a":1,"nested":{"a":2}}` 会被误判为重复键；重复键集合必须按对象层级维护，不能把不同对象中的同名键视为重复。该问题会造成合法请求被拒绝，Gate 1 尚不能完整通过。
2. **转义键等价性未证明**：正则 Set 保存的是原始转义内容，没有将 JSON key 解码后比较；例如直接键与等价 Unicode escape 键可能绕过重复键检测。需结构化原始解析器或至少按解码后的键、对象栈检测。
3. 当前 golden test 证明了 framing 字节换行，但未证明完整 raw JSON 矩阵（嵌套同名键、转义键、双 Host canonical bytes）全部一致。
4. 独立动态探针已复现：发送合法 canonical envelope `body={z:{a:1},y:{a:2}}`（不同对象中的同名 `a` 并非重复键）仍返回 HTTP 400 `invalid_json`，直接证明全局 Set 误拒合法嵌套对象。

## 评分

| Gate 1 项目 | 得分 |
|---|---:|
| BOM/非法 UTF-8/NaN/Infinity/-0 拒绝 | 3/3 |
| canonical bytes 与 framing vector | 3/3 |
| 重复键检测正确性 | 1/2 |
| 原始解析及双 Host 矩阵证据 | 1/2 |
| **Gate 1 合计** | **8/10** |

logic-acceptance 已报告本批次 8/8 测试通过；代码复核发现上述对象作用域与转义键缺口，已通知 Lead。Gate 1 修复前，Gate 2 不应放行；Round 2 总体仍不通过。

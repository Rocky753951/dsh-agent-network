# Round 2 P0-1 Gate 1 独立复测报告

**结论：通过，10/10；联合放行 Gate 2。**

## 证据

- `cd dsh-agent-network/host && npm test`：**8/8 通过**，含 HMAC 实际换行 framing、raw parser regressions 与既有回归。
- 两个独立 Host 均完成同一 vectors：
  - 合法 canonical envelope：HTTP 200；
  - 不同对象中的同名键（`body={z:{a:1},y:{a:2}}`）：两 Host 均 HTTP 200，确认对象 scope stack 不再误拒；
  - escaped duplicate（`{"a":1,"\\u0061":2}`）：两 Host 均 HTTP 400 `invalid_json`，确认 key 解码后重复检测；
  - raw duplicate、BOM、leading whitespace/noncanonical、`-0`、NaN/Infinity：均拒绝且两 Host 结果一致；
  - canonical Unicode key vector 与 HMAC path framing：两 Host canonical bytes/MAC 一致，framing 使用真实换行及正式 POST path。
- `parseStrictJson` 当前按对象 scope 维护键集合，escaped key 通过 `JSON.parse` 解码后比较；此前发现的全局 Set 误拒问题已消除。

## 评分

| Gate 1 项目 | 得分 |
|---|---:|
| BOM/非法 UTF-8/NaN/Infinity/-0 拒绝 | 3/3 |
| canonical bytes 与 framing vector | 3/3 |
| 重复键检测（对象 scope + escaped key） | 2/2 |
| 原始解析及双 Host 矩阵证据 | 2/2 |
| **Gate 1 合计** | **10/10** |

logic-acceptance 的 `logic-round-2-p0-1-gate1-rerun.md` 独立报告同评 10/10。双方确认 Gate 1 全部通过，联合放行 Gate 2；P0-1 其余 Gate 2–5 仍须完成，不能将 Gate 1 放行等同于 P0-1/总体验收通过。

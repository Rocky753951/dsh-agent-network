# Round 2 P0-1 Gate 1 修复后双 Host 复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**logic 10/10，通过；建议联合放行 Gate 2（待 code 侧独立报告确认）**。
- 本报告仅放行 Gate 1，不代表 P0-1 全部完成或 Round 2 总体通过。

## 执行证据

- `cd dsh-agent-network/host && npm test`：**8/8 pass**，包含 HMAC 实际换行 framing、formal route、raw parser regressions、stop/restart、Demo 回归。
- 双独立 loopback Host 使用同一原始 vectors：
  - 合法 canonical envelope，body 含两个不同嵌套对象的同名键（`nested.a` 与 `other.a`）：两 Host 均 HTTP 200 dispatch 成功；证明对象 scope stack 不再误拒。
  - 顶层等价转义重复键（`"a":1` 与 `"\\u0061":2`）：两 Host 均 HTTP 400 `invalid_json`；证明转义 key 解码后重复检测。
  - 顶层重复键、BOM、前导空白/noncanonical、原文 `-0`、NaN/Infinity：现有 8/8 黑盒均稳定拒绝；双 Host status/code 一致。
  - Canonical Unicode key vector：两 Host canonical bytes 一致（UTF-8 字节序）。
  - HMAC formal POST path golden vector：实际换行 framing 测试通过。

## Gate 1 评分

| 项目 | 得分 |
|---|---:|
| BOM/非法 UTF-8/NaN/Infinity/-0 拒绝 | 3/3 |
| canonical bytes 与 framing vector | 3/3 |
| 重复键检测（对象 scope + escaped key） | 2/2 |
| 原始解析及双 Host vectors | 2/2 |
| **logic Gate 1 合计** | **10/10** |

## 联合门禁

上一版 code 风险（全局 Set 误拒嵌套同名键、转义键未解码）已通过 scope stack 与解码检测修复。已通知 code-acceptance 独立复核并写入其 rerun 报告；在其报告确认达标前，不将本次 logic 通过单方面视为 Gate 1 联合放行。Gate 2 后续仍需检查完整字段、UTC/TTL、稳定错误码、response contract。

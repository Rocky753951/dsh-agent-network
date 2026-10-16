# Round 2 P0-0 联合复测（logic 侧）

- 日期：2026-10-15（GMT+8）
- 对照：`GATES-round-2.md` P0-0；已与 code-acceptance 联合复核。
- 结论：**logic 侧通过，10/10；已读取 `code-round-2-p0-0-rerun.md`（code 10/10），双方联合放行 P0-1。**
- 重要边界：P0-0 阶段通过不代表 Round 2 总通过；P0-1~P0-6 仍未验收。

## 复测证据

在 `dsh-agent-network/host` 执行 `npm test`：**7/7 pass**，包括正式 RPC 精确路由、JSON-only、Host stop/restart、Demo 回归和双 Host smoke。

原始 HTTP 探针（loopback Host）：

| 场景 | 结果 |
|---|---|
| 合法 JSON `POST /api/agent-network/v1/rpc` | 200，JSON response envelope |
| `Content-Type: text/plain` | 400，`invalid_content_type` |
| 非法 JSON | 400，`invalid_json`（测试中旧黑盒映射也稳定为 invalid_envelope 前已修复） |
| 空体 | 400，`invalid_json` |
| 非法 UTF-8 字节（fatal decoder） | 400，`invalid_json` |
| 请求体 >1 MiB | 413，`message_too_large` |
| `OPTIONS /api/agent-network/v1/rpc` | 405，`method_not_allowed` |
| 未知 formal 子路径 | 404，`not_found` JSON 错误 |
| Host stop 后 restart | 通过测试，端口生命周期可恢复 |

## 评分与门禁

- **P0-0 logic：10/10**：正式路径、Content-Type、UTF-8 fatal、空体/非法 JSON、1 MiB 字节限制及 413、未知路径/method、stop/restart 均有证据。
- `code-acceptance` 需独立写入 `acceptance/code-round-2-p0-0-rerun.md` 并确认代码侧评分；双方均达标后才放行 P0-1。
- 本阶段不评价严格 DAN envelope、HMAC、hello/session、task、幂等和资源治理；这些仍按 P0-1~P0-6 逐项阻断。

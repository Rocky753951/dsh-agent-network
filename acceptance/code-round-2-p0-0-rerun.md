# Round 2 P0-0 正式路由复测

**结论**：P0-0 **通过，10/10**；放行进入 P0-1。  
**复测范围**：Host formal RPC route、输入边界、错误状态、生命周期。与 logic-acceptance 独立复核后联合确认。

## 证据

- `cd dsh-agent-network/host && npm test`：**7/7 通过**。
- `POST /api/agent-network/v1/rpc` + `application/json` + 合法严格 envelope：HTTP 200，可进入 dispatch。
- 同一路径错误 HTTP method：HTTP 405，`method_not_allowed`。
- `OPTIONS`：HTTP 405；本轮明确正式 RPC 仅允许 POST，不提供 CORS 预检能力。
- 错误 Content-Type：HTTP 400，`invalid_content_type`。
- 空 JSON body：HTTP 400，`invalid_json`。
- 非法 UTF-8：fatal decoder 拒绝，HTTP 400，`invalid_json`。
- 请求体超过 1 MiB：按 UTF-8 bytes 读取阶段拒绝，HTTP 413，`message_too_large`。
- 未知正式路径：HTTP 404，JSON `not_found`。
- stop → start：测试通过，服务可再次监听且资源生命周期正常。

## 代码审查结论

`host/network.js` 已将正式路由精确匹配为 `/api/agent-network/v1/rpc`，在 dispatch 前执行 POST、Content-Type 检查和 fatal UTF-8/byte-limit 读取；错误映射已区分 400/413。`network.test.js` 覆盖正式路径、错误输入、超限及重启。旧 `/dan/0.1/*` 仍作为兼容 Demo 回归运行，未计入 DAN 得分。

**独立评分：10/10。** P0-0 的剩余合同字段（例如 response `reply_to`、完整错误 envelope、HMAC/canonical）属于 P0-1/P0-2，不再阻塞 P0-0 放行；但 P0-1 未完成前，Round 2 总体验收仍不通过。

## 联合决定

logic-acceptance：10/10；code-acceptance：10/10。双方同意 P0-0 放行，进入 P0-1。后续必须继续执行 GATES-round-2.md，不能将本阶段通过等同于 DAN/0.1 总体通过。

## 追加复测（Host 二次修复）

Lead 请求后的独立复测再次执行 `npm test`：**7/7 通过**。当前正式路径实现确认：未知 `/api/agent-network/v1/*` 返回统一 JSON `not_found` 封套；formal handler 的未分类异常返回 `internal_error`；stop/restart 黑盒继续通过。P0-0 评分维持 **code 10/10、logic 10/10**，继续放行 P0-1。

# Round 2 阶段验收：Host P0-0 正式路由与黑盒基线

- 日期：2026-10-15（GMT+8）
- 联合范围：logic-acceptance 执行黑盒；门禁标准来自 `GATES-round-2.md`，已同步 code-acceptance。
- 阶段结论：**部分通过，P0-0 尚未放行；不得视为 Round 2 总通过**。
- 阶段得分：**6/10（logic 与 code 联合建议）**（P0-0 权重 10）；该阶段分数不计作 Round 2 总通过。code-acceptance 已确认同分及阻断理由。

## 已通过证据

在 `dsh-agent-network/host`：

1. `npm test`：**6/6 pass**，新增 formal RPC route 测试通过。
2. 合法 JSON `POST /api/agent-network/v1/rpc` 返回 HTTP 200 与 JSON response envelope，不再 404。
3. 错 Content-Type 返回 400 `invalid_content_type`；GET formal route 返回 405 `method_not_allowed`。
4. 非法 JSON 返回 400 JSON `invalid_envelope`；未知路径返回 404 JSON body。
5. 旧 Demo/alias 测试仍可回归，但未计入 DAN 得分。

## 未通过/待补证据

1. 请求体超过 1 MiB 的探针返回 **400 `invalid_envelope`**，门禁要求读取阶段返回 HTTP 413（并对应稳定超限错误码）；P0-0 资源边界未通过。
2. 尚未证明严格 UTF-8 拒绝、空体稳定错误、双 Host 可重启持久化 harness；未知路径虽为 JSON，但尚未统一为合同错误 envelope。
3. 正式路由当前可在未握手/未认证情形 dispatch ping；这属于后续 P0-2/P0-3 阻断项，不将路由阶段的 200 误判为整体协议合规。

## 联合影响与阻断

- code-acceptance Round 1 已将正式路由、Content-Type/UTF-8/413 列为 P0；因此本阶段 413 缺口是代码与功能共同阻断，不是测试风格差异。
- P0-1、P0-2、P0-3、P0-4、P0-5、P0-6 尚未验收；任一 P0 未完成，Round 2 总结论必须为不通过。
- 下一步：修复超限映射及输入边界，补双 Host start/stop/restart 黑盒后，再重新评估 P0-0；随后按顺序进入 P0-1。

# Client UI/流程独立复验

**评分：6/10；不通过，需修复 callback/transport 与字段契约。**

## 通过项

- `node --check client.js` 通过；ESM/no-build、固定模板、动态 roster 使用 `textContent`，不替换 app root。
- runtime dispatch 优先于 bridge：已有 DSH `sendMessage/createTask` 时直接调用；task runtime 不可用才尝试 bridge submit；bridge 错误有 catch 并显示 note。
- fetch/回调 rejection 在 bridge 操作中有 catch，不会把 promise rejection直接抛到事件循环。
- 显式 endpoint 不猜端口/路径；缺配置时 bridgeCall 明确报 operation 未配置。

## 阻断与风险

1. **callback-only 配置实际不可用**：`bridgeCall` 先读取 `config.endpoints[operation]` 并在缺失时 throw，之后才检查 `config.request`。因此只提供 `{url, protocolVersion, request}` 的 callback-only 宿主无法调用任何操作，违背“request 回调接管 transport”语义。应先判断 request callback，再要求 endpoint 仅作为回调参数可选值，或明确 callback-only schema 并测试。
2. **message bridge 流程缺失/优先级不完整**：runtime message API 不可用时，message 不调用显式 bridge endpoint，而直接 clipboard fallback；若宿主提供 message/request transport，UI仍不会发送网络消息。需增加 message endpoint/operation，或 README 明确这是刻意不支持。
3. **任务字段契约可能错配**：submit 只读取 `result.taskId`，DAN Host 合同使用 `task_id`；status/cancel payload 发送 `{taskId}`，而 Host task methods要求 `task_id`。这会造成任务已 accepted 但 UI 不显示 ID，status/cancel 服务器返回 task_not_found/invalid_envelope。必须冻结映射并同时测试 snake_case/canonical schema。
4. **Promise rejection/clipboard 边界**：bridge catch 本身存在，但 message fallback 使用裸 `navigator.clipboard`；在 Node-only DOM shim/无 navigator 环境会抛 `ReferenceError`，clipboard rejected 也没有状态提示。应使用 `globalThis.navigator?.clipboard?.writeText` 并 await/catch。
5. **task result 展示不安全/不可读**：status/cancel note 直接插入模板字符串 `${result?.result}`，对象显示 `[object Object]`，大结果/敏感文本可能未经截断展示。应只渲染受限状态、task_id/result_hash，详情按 schema 与长度上限呈现。
6. **缺少 client DOM/transport 自动化测试**：当前 client 目录无 test 文件；未覆盖 callback-only、runtime→bridge fallback、bridge rejection、snake_case task IDs、clipboard 缺失、XSS roster、app-root 保持。

## 评分明细

| 项目 | 得分 |
|---|---:|
| ESM/插件边界/DOM XSS | 2/2 |
| 显式 endpoint 与安全约束 | 1/2 |
| runtime/bridge 流程完整性 | 1/2 |
| Promise/错误/clipboard 降级 | 1/2 |
| task 状态/result 字段契约 | 0/1 |
| 自动化测试与可维护性 | 1/1 |
| **合计** | **6/10** |

与 logic-acceptance 独立评分 6/10 一致。核心 UI 安全边界尚可，但 callback-only、message bridge、task snake_case 互操作问题属于功能阻断，修复并补 DOM/transport tests 后再复验。

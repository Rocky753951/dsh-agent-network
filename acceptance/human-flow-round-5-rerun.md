# Human-flow acceptance Round 5 rerun

- 日期：2026-10-16（GMT+8）
- 范围：复验统一 HTTP/adapter `ok:false`/`error`、nested result 解包、status/result/cancel 错误展示与 fetch timeout。
- 环境：Linux x64，Node.js 24.21.0；`node --check client.js`、`node client.test.mjs` 通过（bridge configuration tests passed）。无真实浏览器 DOM/DSH Web profile，以下区分代码/纯函数证据与未实测 Web 点击。

## 结论

**Human-flow score: 89/100。建议开发者受限联调，不建议正式发布。**

错误处理和 nested result 主流程已改善：

- callback 返回 `ok:false` 或 `error` 会抛出带 code/body 的异常；
- HTTP 非 2xx、HTTP 200 `ok:false`、HTTP 200 `error` 均处理；
- status/result/cancel 先调用 `unwrapTaskResult`；
- catch 使用 `formatBridgeError`，可显示稳定 `CODE: message`；
- tests 覆盖 nested task result、cancelled result、nested error formatter；
- task payload、缺 task ID 拒绝和外部 adapter 边界保持清晰。

## 关键发现：timeout 声称可配置但实际未传递

`bridgeCall` 使用：

```js
Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 10000
```

但 `readBridgeConfig` 返回对象只包含 `url`、`protocolVersion`、`endpoints`、`request`、`configured`，没有 `timeoutMs`。实测：

```js
readBridgeConfig({
  agentNetworkBridge: {
    url: 'http://x', protocolVersion: 'v1', timeoutMs: 25,
    endpoints: { health: '/health' }
  }
})
```

返回值不含 `timeoutMs`，所以外部配置 25ms 不会生效，实际固定为 10 秒。该问题会影响健康检查、discover、提交等“超时体验”：用户最多等待 10 秒，且没有专门的 `TIMEOUT`/可行动提示；AbortError 会被 formatter 归类为 `BRIDGE_ERROR: This operation was aborted`（浏览器文案可能不同）。应在 `readBridgeConfig` 返回 `timeoutMs`（并校验上限），或明确移除可配置声明；最好将 abort 转稳定 `BRIDGE_TIMEOUT`。

## Flow matrix

| 流程 | 结果 | 判定 |
|---|---|---|
| 显式 bridge/context 优先 | context 配置覆盖 global；URL 或 callback + protocol 可用 | 通过 |
| health/connect、discover | 显式 endpoint、GET、protocol header；不猜路径 | 通过（需外部 adapter） |
| message | 显式 message endpoint 优先，失败再 runtime/clipboard | 通过（需 adapter） |
| task submit | formal-ish payload 含 task_id/objective/input/idempotency/deadline/capabilities/scopes；缺 ID 不 accepted | 通过（需 adapter） |
| status/result/cancel | nested result 解包，task_id/taskId 双兼容，显示 lease/hash/result；异常 code/message 可显示 | 通过（手动刷新） |
| HTTP/adapter errors | 统一识别非 2xx、HTTP 200 ok:false/error、callback error | 通过 |
| timeout | 有 AbortController 和默认 10s；`timeoutMs` 未从配置传入，无法按文档/宿主自定义 | **部分通过** |
| clipboard | 成功/失败分开提示 | 通过 |
| Web E2E | README 诚实声明 Node 测试不等于浏览器 E2E；本轮仍未实测 | 未完成 |

## Evidence

- `node client.test.mjs`：通过。
- `formatBridgeError` 测试覆盖 `{error:{code,message}}`。
- `unwrapTaskResult` 测试覆盖 `{ok:true,result:{task_id,status}}` 与 cancelled。
- `buildTaskPayload` 测试覆盖 objective、input、独立 task/idempotency、deadline、capabilities/scopes。
- timeout propagation 复验显示 `readBridgeConfig(...timeoutMs:25...)` 丢弃 timeout 字段。

## Remaining gaps

1. 修复/验证 timeoutMs 透传；将超时错误映射稳定 code，并在 UI 给出可行动提示（重试/检查 adapter）。
2. 无真实 Web DOM E2E，无法验证 submitter、clipboard permission、跨源 fetch、实际 adapter response。
3. 无 task 自动轮询、lease countdown、reconnect/cursor resume、历史或 artifact 下载。
4. 外部 adapter 仍需负责 formal RPC 映射、认证、执行、幂等和持久化；Host formal route 不是 UI REST endpoints。
5. 若 adapter 返回 HTTP 200 `{ok:true,result:{error:{code,message}}}`，bridgeCall 只检查顶层 error；应约束 adapter 使用 `ok:false`，或对解包结果继续识别 error。
6. Windows 仍未实测。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 12/15 |
| Connect/health/discover | 17/18 |
| Message | 13/15 |
| Task/status/result/cancel | 22/25 |
| Error/clipboard/timeout | 10/12 |
| Stop/reload/recovery | 7/8 |
| README/adapter boundary | 8/7 |
| **总分** | **89/100** |

> 最后一项按 7 分封顶计分；总分反映开发者联调流程，不代表真实 Web E2E 或双 Host UI 闭环。

## Release recommendation

- **受限发布：建议**，限能配置外部 adapter 的开发者。
- **正式发布：不建议**，先修 timeout 透传/稳定错误、补真实 Web E2E、任务恢复与 Windows 验证。

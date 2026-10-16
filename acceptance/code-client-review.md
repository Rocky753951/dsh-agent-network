# Client UI 代码安全/规范复验

**范围**：`dsh-agent-network/client/client.js`、client README/package；不审 Host。  
**评分：16/20；条件通过，建议补齐 P1 后再宣布 UI 完成。**

## 通过项

- `node --check client.js` 通过；无构建依赖 ESM 入口、`inject`/`apply` 导出保持 DSH client 插件形态。
- UI 仅向 `document.body` 追加独立 toggle/aside，不替换或清空 app root；无 DOM 时 `mount` no-op；重复 mount 有 ID guard。
- 动态 agent 名称、状态与 discover roster 使用 `textContent`；静态模板仅包含固定字符串，未发现直接把用户/bridge 文本拼入 `innerHTML` 的 XSS 路径。
- bridge 只在显式 URL+protocolVersion+endpoint 配置后请求；不猜默认端口、协议或路径；错误以 note 文本提示，不抛出到 UI。
- fetch transport 使用显式 endpoint、协议版本 header；task submit/status/result/cancel 与 health/discover 操作均有 UI 入口；README 有配置示例。

## 风险/打回项

1. **传输无超时/取消**：`bridgeCall` 使用裸 `fetch`，无 AbortController、deadline 或用户取消；断网/挂起 endpoint 可长期占用 UI promise。建议统一 request timeout + abort，并在 status/cancel 上避免并发竞态。
2. **endpoint 安全约束不足**：`new URL(endpoint, config.url)` 允许显式 endpoint 为任意绝对 URL，可能绕过配置 base 发送协议 header/业务数据到外域；应限制为 same-origin/配置 origin，或明确允许名单并拒绝跨 origin/非 HTTPS（loopback 开发例外）。
3. **错误响应解析不稳健**：`response.json()` 对空体/非 JSON 会抛通用 SyntaxError，用户只看到低质量错误；应先按 content-type/文本解析并保留稳定 `error.code`，禁止回显正文/堆栈。
4. **clipboard 降级保护不足**：代码直接访问 `navigator.clipboard`；在 DOM shim/受限 WebView 中 `navigator` 未定义可能在 submit 事件抛异常。应使用 `globalThis.navigator?.clipboard?.writeText`，并处理拒绝提示。
5. **bridge result 直接展示**：status/cancel note 使用 `${result?.result}`，若桥返回对象会显示 `[object Object]`，若返回敏感大文本可能把 task result 原文展示到 UI；应只显示受限状态/task ID，详情按明确 schema 渲染并截断。
6. **缺少 client 自动化测试**：当前无 `client.test.js`/DOM 测试文件；未覆盖 explicit endpoint、防跨域、fetch 错误、Node-only no-DOM、clipboard 缺失、root 保持、XSS roster 与 task flow。

## 结论

核心插件边界、显式 endpoint、DOM/XSS 防护和降级设计通过；建议补 transport timeout/abort、endpoint origin policy、稳健错误解析、clipboard optional chaining 与 client DOM/transport 测试。Host/logic Gate5 结论不因本 UI 复验自动改变。

# Round 6 Client UI 最终逻辑复验（当前工作树重跑）

- `node client.test.mjs`：通过。
- `node --check client.js`：通过。
- 外部 fetch adapter stub：HTTP 200 nested `{response:{ok:false,error:{code,message}}}` 正确抛出 `FETCH_NESTED`/message/body。
- 结论：**9/10，条件通过；result 内部 error 显示仍缺一层处理**。

## 通过

- callback/fetch adapter 多层 envelope 错误归一化、稳定 code/body；nested callback 与 nested fetch 均实测通过。
- `timeoutMs` 透传、AbortError→`BRIDGE_TIMEOUT`、网络错误→`BRIDGE_NETWORK_ERROR`。
- formal task fields 与独立 task_id/idempotency_key；status/result/cancel 的外层 `result` unwrap；showResult 循环安全。
- `client.test.mjs` 覆盖 nested adapter error、timeout 配置、formal fields、nested unwrap；helper/边界 smoke 通过。

## 剩余问题：result 内部嵌套 error

- 实测 `unwrapTaskResult({ok:true,result:{error:{code:"INNER",message:"bad result"}}})` 返回内部 error 对象本身；task status/cancel UI line 150 只读取 `status/error_code`，会显示 `OK`，不会调用 `formatBridgeError` 呈现 `INNER: bad result`。
- 正式 envelope error（外层/response.error）已正确；此项仅针对“成功 envelope 内部 result.error”的异常 adapter payload，需要明确视为错误并显示稳定码，或在合同中明确 result.error 是业务结果而非 transport error。

## 评分

| 项目 | 得分 |
|---|---:|
| formal task fields/status/result/cancel | 2/2 |
| callback/fetch adapter boundary | 2/2 |
| timeout/stable errors/showResult safety | 2/2 |
| result-internal error handling | 1/2 |
| automated client/helper evidence | 2/2 |
| **总分** | **9/10** |

Human-flow 92/100 的 timeout、nested envelope、unwrap、稳定码与安全渲染结论已独立复核；当前唯一逻辑余项为内部 result.error 的产品/协议边界处理。
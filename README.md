# DSH Agent Network

用于让多个独立 DSH 实例以 Agent 身份通信、派发消息和协作任务的插件原型。

## 目录

- `PROTOCOL.md`：DAN/0.1 跨节点协议草案、安全模型与演进路线。
- `host/`：Host bundle；提供 loopback HTTP/SSE bridge，以及 Agent 可调用的 register/send/receive/health 工具。
- `client/`：Web client bundle；提供 Agent 列表、在线状态、消息/任务操作面板。
- 根目录 `package.json`：DSH 组合包声明；请从仓库根目录安装，不要从 `host/` 或 `client/` 子目录安装。

## 安装

从仓库根目录执行：

```sh
dsh plugin --profile web add .
```

该包声明了 `dsh.bundle.patch`，并由 `host/cordis.patch.yml` 注册 Host。安装后重启对应 DSH profile；插件默认只绑定 loopback。若从 ZIP 下载，请解压后进入包含根目录 `package.json` 的目录再安装。

## 快速验证

```sh
cd host && node --check index.js && node --check network.js
cd ../client && node --check client.js
```

Host bridge 的独立烟测：

```sh
cd host
node --input-type=module - <<'NODE'
import { AgentNetworkServer } from './network.js';
const s = new AgentNetworkServer({ port: 0 });
await s.start();
const base = `http://127.0.0.1:${s.address().port}`;
await fetch(`${base}/register`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({agentId:'demo'}) });
await fetch(`${base}/send`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({to:'demo', payload:{text:'hello'}}) });
console.log(await fetch(`${base}/receive?agentId=demo`).then(r => r.json()));
await s.stop();
NODE
```

## 当前边界

这是最小原型，不是公网可部署的安全通信层：默认只绑定 `127.0.0.1`，尚未把 DAN/0.1 的 HMAC/mTLS、幂等、租约、cursor 恢复完整接入。不要把端口绑定到 `0.0.0.0`，也不要把 ACP stdio 或浏览器 Cookie 当作跨主机认证。公网部署前应先实现 `PROTOCOL.md` 中的双向身份校验、授权、限流、消息去重和 TLS/mTLS。

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

## 装完就能用

重启 profile 后打开 DSH Web 界面，右下角出现 **Agents** 按钮即已就位，**不需要手工配置任何 bridge**：

1. 面板加载时向 `http://127.0.0.1:8787/api/agent-network/v1/bridge-config` 询问本机 Host 的连接器地址与令牌（仅 loopback 页面可读）。
2. 拿到后按 `local` 传输调用 `POST /api/agent-network/v1/local`，请求体是 `{operation, payload}`，令牌放在 `x-agent-network-token` 头。
3. 配对、消息、任务状态都在面板内完成；配对 id 与状态写入 `localStorage`，刷新页面后自动恢复并继续刷新。

端口不是 8787 时，可用 `window.__DSH_AGENT_NETWORK_PORT__ = <port>`（或 `__DSH_AGENT_NETWORK_BRIDGE__.discoverUrl`）指定候选地址；Host 端用 `cordis.patch.yml` 的 `config.port` 调整。需要跨重启保持同一连接器令牌时，配置 `config.tokenFile`（例如 `~/.dsh/agent-network-token`），文件以 0600 写入。

面板在 `127.0.0.1:33080`、连接器在 `127.0.0.1:8787`，两者跨源，因此连接器对 `OPTIONS` 预检放行（允许 `content-type`、`x-agent-network-token`、`x-dsh-protocol-version`），预检发生在令牌校验之前。默认信任任意 loopback 来源是零配置的代价：**如果这台机器上有其他本地开发服务或不可信页面，请把 `config.allowedOrigins` 设成面板的确切来源（如 `["http://127.0.0.1:33080"]`）**，配置后白名单即为唯一信任集。`bridge-config` 以 `cache-control: no-store` 返回，避免令牌被缓存。

## 快速验证

```sh
cd host && node --check index.js && node --check network.js
cd ../client && node --check client.js
```

Host 的独立烟测（连接器 + 来源围栏）：

```sh
cd host
node --input-type=module - <<'NODE'
import { AgentNetworkServer } from './network.js';
const s = new AgentNetworkServer({ port: 0 });
await s.start();
const base = `http://127.0.0.1:${s.address().port}`;
const call = (operation, payload = {}) => fetch(`${base}/api/agent-network/v1/local`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-agent-network-token': s.localToken },
  body: JSON.stringify({ operation, payload })
}).then(async (r) => ({ status: r.status, body: await r.json() }));
console.log((await call('health')).body.result.ok);          // true
const invite = await call('invite.create', { permissions: ['message.send'], duration: 3600 });
console.log(invite.body.result.status);                       // invited
await call('join.request', { token: invite.body.result.token });
await call('approve', { pairing_id: invite.body.result.pairing_id });
console.log((await call('session.open', { pairing_id: invite.body.result.pairing_id })).body.result.status); // connected
await s.stop();
NODE
```

完整测试：根目录 `npm test`（Host 33 项 + client 11 项）。

## 当前边界

这是最小原型，不是公网可部署的安全通信层：默认只绑定 `127.0.0.1`；DAN/0.1 的 HMAC、幂等、租约已实现，但事件流（cursor 恢复）、mTLS、限流仍未接入。不要把端口绑定到 `0.0.0.0`，也不要把 ACP stdio 或浏览器 Cookie 当作跨主机认证。

本机连接器（`/api/agent-network/v1/local`）是**仅限 loopback 页面**的窄通道，不是远程接口：它由 loopback `Origin`/`Host` 围栏加一次性下发到页面的连接器令牌保护，且只以本机身份对执行操作。远程节点必须继续走 `/api/agent-network/v1/rpc` 的 HMAC 签名路径；两条通道的凭据互相独立，详见 `PROTOCOL.md` 11.6。

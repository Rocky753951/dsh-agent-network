# DSH Agent Network Host

> **Acceptance label:** demo/adapter smoke only; this does not claim full DAN/0.1 protocol compliance. This package is a Node Host developer preview only; it does not provide the Client bridge, discovery/connection UI, task status/result UI, or cancellation UI.

Minimal Host-only DSH bundle using the documented `apply(ctx, config)` export and `dsh.bundle.patch` manifest. It starts a loopback HTTP/SSE bridge (Node built-ins only) and registers four Agent-callable tools: `agent_network_register`, `agent_network_send`, `agent_network_receive`, and `agent_network_health`.

## Test

```sh
cd /home/wei/workspace/dsh/dsh-agent-network/host
node --test
```

## Formal DAN endpoint

The only formal protocol entry point is:

- `POST /api/agent-network/v1/rpc` — requires canonical UTF-8 JSON and HS256 HMAC framing. Configure `contract.hmac` with `keyId`, `keys`, `bindings` (`key_id → sender`) and `required: true`.

The formal route is loopback-only and must not be exposed publicly. The formal response/error envelope and replay/idempotency rules are implemented in `contract.js`.

## Demo compatibility API (not DAN compliance)

These routes are unauthenticated local compatibility helpers and must not be used as DAN credentials or acceptance evidence:

- `POST /dan/0.1/register` (alias `/register`)
- `POST /dan/0.1/send` (alias `/send`)
- `GET /dan/0.1/receive?agentId=<id>` (alias `/receive`, queue polling)
- `GET /dan/0.1/receive?agentId=<id>&stream=1` returns `404 events_disabled`; cursor/resume is not implemented.

The patch defaults to `127.0.0.1:8787`; set `port: 0` for tests. The Host plugin enforces `127.0.0.1`, `localhost`, or `::1`. CORS `*` and demo routes are for local development only; never expose them through a proxy without authentication and origin/tenant checks. Secrets must come from protected DSH configuration, never URLs or logs.

## Install / platform status

This directory is a Host bundle: install/select it through the DSH plugin manager/profile rather than running a second web server. Linux/macOS Node.js testing is covered by `npm test`. Windows is **not tested in this release**; Windows support remains theoretical and requires a separate validation pass.

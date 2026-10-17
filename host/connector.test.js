import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentNetworkServer } from "./network.js";
import { buildLocalEnvelope } from "./contract.js";

// Node's fetch silently drops forbidden headers such as Origin, so the browser
// boundary has to be exercised with a raw HTTP request instead.
const rawRequest = (base, path, headers = {}) => new Promise((resolve, reject) => {
  const url = new URL(path, base);
  const request = httpRequest({ hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, method: "GET", headers }, (response) => {
    let text = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { text += chunk; });
    response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(text || "{}"), headers: response.headers }));
  });
  request.on("error", reject);
  request.end();
});

const boot = async (t, options = {}) => {
  const server = new AgentNetworkServer({ host: "127.0.0.1", port: 0, ...options });
  await server.start();
  t.after(() => server.stop());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (operation, payload = {}) => fetch(`${base}/api/agent-network/v1/local`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-network-token": server.localToken },
    body: JSON.stringify({ operation, payload })
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  const bridge = () => fetch(`${base}/api/agent-network/v1/bridge-config`, {
    headers: { origin: "http://127.0.0.1:33080" }
  }).then(async (response) => ({ status: response.status, body: await response.json(), headers: response.headers }));
  return { server, base, call, bridge, raw: (path, headers) => rawRequest(base, path, headers) };
};

test("bridge-config exposes a loopback connector token but never a signing key", async (t) => {
  const { server, bridge } = await boot(t, { contract: { hmac: { keyId: "k1", keys: { k1: "top-secret" } } } });
  const config = await bridge();
  assert.equal(config.status, 200);
  assert.equal(config.body.ok, true);
  assert.equal(config.body.protocol, "dan/0.1");
  assert.equal(config.body.connector.endpoint, "/api/agent-network/v1/local");
  assert.equal(typeof config.body.connector.token, "string");
  assert.ok(config.body.connector.token.length > 20);
  assert.equal(config.body.connector.token, server.localToken);
  assert.notEqual(config.body.connector.token, "top-secret");
  assert.equal(config.body.connector.roles.host, config.body.connector.roles.peer.replace(/-peer$/, ""));
  assert.ok(!JSON.stringify(config.body).includes("top-secret"));
});

test("bridge-config is unreadable from a foreign origin", async (t) => {
  const { raw } = await boot(t);
  const foreign = await raw("/api/agent-network/v1/bridge-config", { origin: "https://evil.example" });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.error.code, "origin_not_allowed");
  const rebound = await raw("/api/agent-network/v1/bridge-config", { host: "evil.example" });
  assert.equal(rebound.status, 403);
  assert.equal(rebound.body.error.code, "invalid_host");
  const loopback = await raw("/api/agent-network/v1/bridge-config", { origin: "http://127.0.0.1:33080" });
  assert.equal(loopback.status, 200);
  assert.equal(loopback.headers["access-control-allow-origin"], "http://127.0.0.1:33080");
});

test("connector runs the full pairing flow on a single machine", async (t) => {
  const { call } = await boot(t);
  const health = await call("health");
  assert.equal(health.status, 200);
  assert.equal(health.body.result.ok, true);

  const invite = await call("invite.create", { permissions: ["message.send", "task.submit"], duration: 3600 });
  assert.equal(invite.status, 200, JSON.stringify(invite.body));
  const pairingId = invite.body.result.pairing_id;
  assert.equal(typeof pairingId, "string");
  assert.equal(invite.body.result.status, "invited");
  assert.equal(invite.body.result.inviter, "host");
  assert.deepEqual(invite.body.result.permissions, { allow: ["message.send", "task.submit"] });

  const join = await call("join.request", { token: invite.body.result.token });
  assert.equal(join.status, 200, JSON.stringify(join.body));
  assert.equal(join.body.result.status, "pending");

  const approve = await call("approve", { pairing_id: pairingId });
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  assert.equal(approve.body.result.status, "approved");

  const opened = await call("session.open", { pairing_id: pairingId });
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.result.status, "connected");

  const status = await call("status", { pairing_id: pairingId });
  assert.equal(status.body.result.status, "connected");
  assert.ok(status.body.result.expires_at);

  const revoked = await call("revoke", { pairing_id: pairingId });
  assert.equal(revoked.body.result.status, "revoked");

  // A revoked pairing must not be resurrected by a later approval.
  const afterRevoke = await call("approve", { pairing_id: pairingId });
  assert.equal(afterRevoke.status, 409, JSON.stringify(afterRevoke.body));
});

test("connector carries message and task operations with idempotency", async (t) => {
  const { call } = await boot(t, { contract: { nodeId: "node-local" } });
  const describe = await call("describe");
  assert.equal(describe.body.result.node_id, "node-local");

  const payload = { target: "node-local", message: "hello", idempotency_key: "idem-1" };
  const first = await call("message", payload);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const second = await call("message", payload);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.result, first.body.result);
  assert.equal(first.body.result.accepted, true);

  const submitted = await call("submit", {
    task_id: "task-1", objective: "do work", input: { text: "work" }, idempotency_key: "task-idem-1",
    deadline: new Date(Date.now() + 600000).toISOString(), required_capabilities: [], write_scopes: []
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  const taskStatus = await call("status", { task_id: "task-1" });
  assert.equal(taskStatus.status, 200, JSON.stringify(taskStatus.body));
  assert.equal(taskStatus.body.result.task_id, "task-1");
  assert.ok(["queued", "running", "done"].includes(taskStatus.body.result.status));
});

test("connector rejects missing tokens, unknown operations, and untrusted callers", async (t) => {
  const { base, server } = await boot(t);
  const noToken = await fetch(`${base}/api/agent-network/v1/local`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "health", payload: {} })
  });
  assert.equal(noToken.status, 401);

  const wrongToken = await fetch(`${base}/api/agent-network/v1/local`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-network-token": "not-the-token" },
    body: JSON.stringify({ operation: "health", payload: {} })
  });
  assert.equal(wrongToken.status, 401);

  const unknown = await fetch(`${base}/api/agent-network/v1/local`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-network-token": server.localToken },
    body: JSON.stringify({ operation: "shell.exec", payload: { command: "id" } })
  });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error.code, "unknown_operation");

  const foreign = await fetch(`${base}/api/agent-network/v1/local`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example", "x-agent-network-token": server.localToken },
    body: JSON.stringify({ operation: "health", payload: {} })
  });
  assert.equal(foreign.status, 403);
});

test("the connector token persists in a 0600 file and survives a restart", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-an-token-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tokenFile = join(dir, "token");
  const first = new AgentNetworkServer({ host: "127.0.0.1", port: 0, tokenFile });
  await first.start();
  const token = first.localToken;
  assert.ok(token.length > 20);
  const mode = statSync(tokenFile).mode & 0o777;
  assert.equal(mode, 0o600);
  assert.equal(readFileSync(tokenFile, "utf8").trim(), token);
  await first.stop();

  const second = new AgentNetworkServer({ host: "127.0.0.1", port: 0, tokenFile });
  await second.start();
  t.after(() => second.stop());
  assert.equal(second.localToken, token);
  const response = await fetch(`http://127.0.0.1:${second.address().port}/api/agent-network/v1/local`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-network-token": token },
    body: JSON.stringify({ operation: "health", payload: {} })
  });
  assert.equal(response.status, 200);
});

test("the browser preflight succeeds before any token is sent", async (t) => {
  const { base } = await boot(t);
  const preflight = await new Promise((resolve, reject) => {
    const url = new URL("/api/agent-network/v1/local", base);
    const request = httpRequest({
      hostname: url.hostname, port: url.port, path: url.pathname, method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:33080",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-agent-network-token,x-dsh-protocol-version"
      }
    }, (response) => { response.resume(); response.on("end", () => resolve({ status: response.statusCode, headers: response.headers })); });
    request.on("error", reject);
    request.end();
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], "http://127.0.0.1:33080");
  assert.match(preflight.headers["access-control-allow-headers"], /x-agent-network-token/);
  assert.match(preflight.headers["access-control-allow-headers"], /x-dsh-protocol-version/);
  assert.match(preflight.headers["access-control-allow-methods"], /POST/);

  const foreign = await new Promise((resolve, reject) => {
    const url = new URL("/api/agent-network/v1/local", base);
    const request = httpRequest({ hostname: url.hostname, port: url.port, path: url.pathname, method: "OPTIONS", headers: { origin: "https://evil.example" } }, (response) => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
    request.on("error", reject);
    request.end();
  });
  assert.equal(foreign, 403);
});

test("bridge-config is not cacheable and a configured origin allowlist is authoritative", async (t) => {
  const { bridge } = await boot(t);
  const config = await bridge();
  assert.equal(config.headers.get("cache-control"), "no-store");

  const strict = await boot(t, { allowedOrigins: ["http://127.0.0.1:33080"] });
  assert.equal((await strict.bridge()).status, 200);
  const otherOrigin = await new Promise((resolve, reject) => {
    const url = new URL("/api/agent-network/v1/bridge-config", strict.base);
    const request = httpRequest({ hostname: url.hostname, port: url.port, path: url.pathname, headers: { origin: "http://127.0.0.1:5173" } }, (response) => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
    request.on("error", reject);
    request.end();
  });
  assert.equal(otherOrigin, 403);
});

test("a connected joiner cannot drop pairing_id to escape its scope", async (t) => {
  const { server, call } = await boot(t);
  const invite = await call("invite.create", { permissions: ["message.send"], duration: 3600 });
  const { pairing_id: pairingId, token } = invite.body.result;
  await call("join.request", { token });
  await call("approve", { pairing_id: pairingId });
  await call("session.open", { pairing_id: pairingId });

  const peerEnvelope = (method, params) => buildLocalEnvelope({ sender: server.roles.peer, recipient: server.roles.host, method, params });
  const task = { task_id: "task-1", objective: "scope probe", input: {}, deadline: new Date(Date.now() + 600000).toISOString(), required_capabilities: [], write_scopes: [], idempotency_key: "probe-1" };
  await assert.rejects(() => server.contract.dispatch(peerEnvelope("task.submit", task)), /forbidden/);
  await assert.rejects(() => server.contract.dispatch(peerEnvelope("task.submit", { ...task, pairing_id: pairingId })), /forbidden/);
  const allowed = await server.contract.dispatch(peerEnvelope("message.send", { payload: { text: "hi" }, idempotency_key: "probe-2" }));
  assert.equal(allowed.ok, true);
  const scoped = await server.contract.dispatch(peerEnvelope("message.send", { payload: { text: "hi" }, idempotency_key: "probe-3", pairing_id: pairingId }));
  assert.equal(scoped.ok, true);
});

test("approving without permissions keeps the invited scopes and durations stay exact", async (t) => {
  const { call } = await boot(t);
  const invite = await call("invite.create", { permissions: ["message.send", "task.write"], duration: 900 });
  const pairingId = invite.body.result.pairing_id;
  assert.equal(invite.body.result.duration, "15m");
  await call("join.request", { token: invite.body.result.token });
  const approved = await call("approve", { pairing_id: pairingId });
  assert.deepEqual(approved.body.result.permissions, { allow: ["message.send", "task.write"] });
  assert.equal(approved.body.result.duration, "15m");

  for (const [seconds, expected] of [[28800, "8h"], [86400, "24h"], [604800, "7d"]]) {
    const made = await call("invite.create", { permissions: ["message.send"], duration: seconds });
    assert.equal(made.body.result.duration, expected);
  }
  const rejected = await call("invite.create", { permissions: ["message.send"], duration: 42 });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, "invalid_params");
});

test("malformed demo bodies are client errors and non-members cannot read a pairing", async (t) => {
  const { base, server, call } = await boot(t);
  const malformed = await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json", "x-agent-network-token": server.localToken }, body: "{" });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "invalid_json");

  const invite = await call("invite.create", { permissions: ["message.send"], duration: 3600 });
  const outsider = buildLocalEnvelope({ sender: "stranger", recipient: server.roles.host, method: "pair.status", params: { pairing_id: invite.body.result.pairing_id } });
  await assert.rejects(() => server.contract.dispatch(outsider), /forbidden/);
});

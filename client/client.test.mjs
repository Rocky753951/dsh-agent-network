import test from "node:test";
import assert from "node:assert/strict";
import {
  readBridgeConfig, connectorCandidates, discoverBridge, buildTaskPayload, pairingPayload,
  normalizePairingResult, unwrapTaskResult, assertNoResultError, formatBridgeError, bridgeCall
} from "./client.js";

test("readBridgeConfig requires a protocol version and a transport it can use", () => {
  assert.equal(readBridgeConfig({}).configured, false);
  const http = readBridgeConfig({ agentNetworkBridge: { url: "https://example.test", protocolVersion: "v1", endpoints: { health: "/health" } } });
  assert.equal(http.configured, true);
  assert.equal(http.transport, "http");
  assert.equal(http.timeoutMs, 10000);
  const callback = readBridgeConfig({ agentNetworkBridge: { protocolVersion: "v1", timeoutMs: 25, request: async () => ({}) } });
  assert.equal(callback.configured, true);
  assert.equal(callback.timeoutMs, 25);
  assert.deepEqual(readBridgeConfig({ agentNetworkBridge: { url: "x", protocolVersion: "v1", endpoints: { submit: "/submit", bad: 4 } } }).endpoints, { submit: "/submit" });
});

test("a local connector transport is configured only with url, token, and protocol", () => {
  const complete = readBridgeConfig({ agentNetworkBridge: { url: "http://127.0.0.1:8787", protocolVersion: "dan/0.1", transport: "local", token: "abc" } });
  assert.equal(complete.configured, true);
  assert.equal(complete.transport, "local");
  assert.equal(complete.connectorEndpoint, "/api/agent-network/v1/local");
  assert.equal(readBridgeConfig({ agentNetworkBridge: { url: "http://127.0.0.1:8787", protocolVersion: "dan/0.1", transport: "local" } }).configured, false);
});

test("connector discovery finds the loopback Host bridge-config", async () => {
  assert.deepEqual(connectorCandidates({}), ["http://127.0.0.1:8787/api/agent-network/v1/bridge-config"]);
  assert.deepEqual(connectorCandidates({ agentNetworkBridge: { discoverUrl: "http://127.0.0.1:9000/cfg" } }), ["http://127.0.0.1:9000/cfg"]);
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    return {
      ok: true,
      json: async () => ({
        ok: true, protocol: "dan/0.1",
        connector: { url: "http://127.0.0.1:8787", endpoint: "/api/agent-network/v1/local", token: "connector-token", roles: { host: "host", peer: "host-peer" } }
      })
    };
  };
  const found = await discoverBridge({}, { fetchImpl });
  assert.equal(seen.length, 1);
  assert.equal(found.configured, true);
  assert.equal(found.transport, "local");
  assert.equal(found.token, "connector-token");
  assert.equal(found.url, "http://127.0.0.1:8787");
  assert.equal(found.protocolVersion, "dan/0.1");
});

test("connector discovery stays unconfigured when nothing is listening", async () => {
  const found = await discoverBridge({}, { fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  assert.equal(found.configured, false);
});

test("a local bridgeCall posts operation and payload with the connector token", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ kind: "response", ok: true, result: { status: "invited" } }) };
  };
  try {
    const config = readBridgeConfig({ agentNetworkBridge: { url: "http://127.0.0.1:8787", protocolVersion: "dan/0.1", transport: "local", token: "abc" } });
    const result = await bridgeCall(config, "invite.create", { permissions: ["message.send"] });
    assert.equal(result.result.status, "invited");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8787/api/agent-network/v1/local");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["x-agent-network-token"], "abc");
    assert.deepEqual(JSON.parse(calls[0].options.body), { operation: "invite.create", payload: { permissions: ["message.send"] } });
  } finally { globalThis.fetch = original; }
});

test("a local bridgeCall surfaces Host error codes", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: { code: "origin_not_allowed", message: "origin_not_allowed" } }) });
  try {
    const config = readBridgeConfig({ agentNetworkBridge: { url: "http://127.0.0.1:8787", protocolVersion: "dan/0.1", transport: "local", token: "abc" } });
    await assert.rejects(() => bridgeCall(config, "health", {}), (error) => error.code === "origin_not_allowed");
  } finally { globalThis.fetch = original; }
});

test("pairing payloads carry the protocol roles and duration enum", () => {
  const pairing = pairingPayload("invite.create", { scope_allowlist: ["read"], duration_seconds: 3600 });
  assert.equal(pairing.role, "host");
  assert.deepEqual(pairing.permissions, ["read"]);
  assert.equal(pairing.duration, "1h");
  assert.equal(pairing.duration_seconds, undefined);
  assert.equal(pairingPayload("join.request", { invite_code: "masked" }).token, "masked");
  assert.equal(pairingPayload("approve", { pairing_id: "p1", duration: 86400 }).duration, "24h");
  assert.equal(pairingPayload("session.open", { pairing_id: "p1" }).pairing_id, "p1");
});

test("pairing results are normalized from the Host field names", () => {
  const normalized = normalizePairingResult({ status: "connected", permissions: ["read"], duration: "1h" });
  assert.equal(normalized.state, "connected");
  assert.equal(normalized.duration_seconds, 3600);
  assert.equal(normalized.duration_label, "1h");
  const invited = normalizePairingResult({ status: "invited", token: "code-1" });
  assert.equal(invited.invite_code, "code-1");
});

test("task payloads carry every field the contract requires", () => {
  const task = buildTaskPayload({ target: "agent-a", text: "do work" });
  for (const key of ["task_id", "objective", "input", "idempotency_key", "deadline", "required_capabilities", "write_scopes"]) assert.ok(task[key] !== undefined, key);
  assert.notEqual(task.task_id, task.idempotency_key, "formal ids are independently generated");
  assert.ok(Date.parse(task.deadline) > Date.now());
});

test("task results unwrap nested envelopes and surface embedded errors", () => {
  assert.equal(unwrapTaskResult({ ok: true, result: { task_id: "nested-id", status: "completed" } }).task_id, "nested-id");
  assert.equal(unwrapTaskResult({ ok: true, result: { status: "cancelled" } }).status, "cancelled");
  assert.throws(() => assertNoResultError(unwrapTaskResult({ ok: true, result: { error: { code: "TASK_FAILED", message: "failed" } } })), /failed/);
  assert.equal(formatBridgeError({ error: { code: "LEASE_EXPIRED", message: "lease expired" } }), "LEASE_EXPIRED: lease expired");
  assert.equal(formatBridgeError({ body: { response: { error: { code: "NESTED_BAD", message: "bad" } } } }), "NESTED_BAD: bad");
});

test("a callback bridge reports nested failures", async () => {
  await assert.rejects(
    () => bridgeCall({ configured: true, protocolVersion: "v1", endpoints: {}, request: async () => ({ response: { ok: false, error: { code: "NESTED_BAD", message: "bad" } } }) }, "status", {}),
    /bad/
  );
});

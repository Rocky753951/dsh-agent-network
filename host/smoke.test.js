import test from "node:test";
import assert from "node:assert/strict";
import { AgentNetworkServer } from "./network.js";
import { signEnvelope } from "./contract.js";

const makeRequest = (messageId = "message-1") => ({
  kind: "request", protocol: "dan/0.1", request_id: "request-1", message_id: messageId,
  session_id: "session-a", sender: "node-a", recipient: "node-b", sent_at: new Date().toISOString(),
  ttl_ms: 30000, seq: 1, body: { method: "message.send", params: { payload: { text: "hello B" } } }
});

const post = (base, body, token) => fetch(`${base}/dan/0.1/rpc`, {
  method: "POST", headers: { "content-type": "application/json", "x-agent-network-token": token }, body: JSON.stringify(body)
}).then(async (response) => ({ status: response.status, body: await response.json() }));

test("demo/adapter smoke: two loopback Hosts exchange HMAC message.send and dedupe message_id", async (t) => {
  const hmac = { keyId: "smoke-key", keys: { "smoke-key": "loopback-secret" }, required: true };
  const hostA = new AgentNetworkServer({ host: "127.0.0.1", port: 0, contract: { nodeId: "node-a", hmac } });
  const hostB = new AgentNetworkServer({ host: "127.0.0.1", port: 0, contract: { nodeId: "node-b", hmac } });
  await Promise.all([hostA.start(), hostB.start()]);
  t.after(async () => { await Promise.all([hostA.stop(), hostB.stop()]); });
  const baseB = `http://127.0.0.1:${hostB.address().port}`;
  const request = makeRequest();
  request.auth = { key_id: "smoke-key" };
  request.auth.mac = signEnvelope(request, "loopback-secret");

  const first = await post(baseB, request, hostB.localToken);
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.result.accepted, true);
  const duplicate = await post(baseB, request, hostB.localToken);
  assert.equal(duplicate.status, 200);
  assert.deepEqual(duplicate.body, first.body);

  const wrongKey = makeRequest("message-2");
  wrongKey.auth = { key_id: "smoke-key", mac: signEnvelope(wrongKey, "wrong-secret") };
  const rejected = await post(baseB, wrongKey, hostB.localToken);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.body.error.code, "unauthorized");
});

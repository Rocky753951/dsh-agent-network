import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DanContractAdapter } from "./contract.js";

const env = (method, params, n = randomUUID()) => ({ kind: "request", protocol: "dan/0.1", request_id: randomUUID(), message_id: n, session_id: randomUUID(), sender: "host", recipient: "host", sent_at: new Date().toISOString(), ttl_ms: 30000, seq: 1, method, body: { params } });
test("pairing state survives adapter restart without exposing token hash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dan-pair-")); const file = join(dir, "replay.json");
  try { const a = new DanContractAdapter({ replayFile: file }); const invite = await a.dispatch(env("pair.invite.create", { permissions: { allow: ["task.read"] }, duration: "1h", idempotency_key: "pair-1" })); assert.equal(invite.result.status, "invited");
    const b = new DanContractAdapter({ replayFile: file }); const status = await b.dispatch(env("pair.status", { pairing_id: invite.result.pairing_id })); assert.equal(status.result.status, "invited"); assert.equal("token_hash" in status.result, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

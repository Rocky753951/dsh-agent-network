import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

export const DAN_PROTOCOL = "dan/0.1";
const METHODS = new Set(["ping", "describe", "message.send", "task.submit", "task.accept", "task.result", "task.cancel"]);
const ID = /^[A-Za-z0-9._:-]{1,200}$/;

export function canonical(value) {
  if (value === undefined) return undefined;
  if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) throw new Error("invalid_number");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).filter((item) => item !== undefined).join(",")}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

export function signEnvelope(envelope, secret, { path = "/api/agent-network/v1/rpc" } = {}) {
  if (!secret) throw new Error("hmac secret is required");
  const unsigned = { ...envelope };
  if (unsigned.auth) { unsigned.auth = { ...unsigned.auth }; delete unsigned.auth.mac; }
  else delete unsigned.auth;
  const framing = `${DAN_PROTOCOL}\nPOST\n${path}\n${canonical(unsigned)}`;
  return createHmac("sha256", secret).update(framing, "utf8").digest("base64url");
}

export function verifyEnvelopeMac(envelope, secret, options) {
  const provided = envelope?.auth?.mac;
  if (typeof provided !== "string" || !secret) return false;
  const expected = signEnvelope(envelope, secret, options);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const STRICT_FIELDS = new Set(["protocol", "kind", "request_id", "message_id", "session_id", "sender", "recipient", "sent_at", "ttl_ms", "seq", "method", "body", "auth", "trace"]);
const STRICT_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9A-HJKMNP-TV-Z]{26})$/i;

export function validateEnvelope(envelope, { now = Date.now(), maxMessageBytes = 262144, requireAuth = false, strict = false } = {}) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("invalid_envelope");
  if (strict && Object.keys(envelope).some((key) => !STRICT_FIELDS.has(key))) throw new Error("invalid_envelope");
  for (const field of ["request_id", "message_id", "session_id", "sender", "recipient"]) if (typeof envelope[field] !== "string" || !ID.test(envelope[field]) || strict && !STRICT_ID.test(envelope[field])) throw new Error(`invalid_${field}`);
  if (envelope.protocol !== DAN_PROTOCOL) throw new Error("unsupported_version");
  if (!new Set(["request", "response", "event", "ack", "cancel"]).has(envelope.kind)) throw new Error("invalid kind");
  if (typeof envelope.sent_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(envelope.sent_at) || Number.isNaN(Date.parse(envelope.sent_at))) throw new Error("invalid_sent_at");
  if (strict && Date.parse(envelope.sent_at) - now > 300000) throw new Error("invalid_sent_at");
  if (!Number.isInteger(envelope.ttl_ms) || envelope.ttl_ms < (strict ? 1000 : 1) || envelope.ttl_ms > 300000) throw new Error("invalid_ttl_ms");
  if (now - Date.parse(envelope.sent_at) > envelope.ttl_ms) throw new Error("expired");
  if (strict && (!Number.isInteger(envelope.seq) || envelope.seq < 0 || typeof envelope.method !== "string" || !envelope.method || !envelope.body || typeof envelope.body !== "object")) throw new Error("invalid_envelope");
  if (envelope.body === undefined || Buffer.byteLength(JSON.stringify(envelope.body)) > maxMessageBytes) throw new Error("message_too_large");
  if (strict && envelope.trace && (typeof envelope.trace !== "object" || Object.keys(envelope.trace).some((key) => !["trace_id", "parent_id"].includes(key)) || typeof envelope.trace.trace_id !== "string")) throw new Error("invalid_envelope");
  if (requireAuth && (!envelope.auth?.key_id || !envelope.auth?.mac)) throw new Error(strict ? "invalid_envelope" : "unauthorized");
  if (strict && envelope.auth) {
    const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
    if (envelope.auth.alg !== "HS256" || typeof envelope.auth.key_id !== "string" || typeof envelope.auth.mac !== "string" || typeof envelope.auth.ts !== "string" || !utc.test(envelope.auth.ts) || Number.isNaN(Date.parse(envelope.auth.ts))) throw new Error("invalid_envelope");
    if (typeof envelope.auth.nonce !== "string" || !/^[A-Za-z0-9_-]{22,}$/.test(envelope.auth.nonce)) throw new Error("invalid_envelope");
    if (Math.abs(now - Date.parse(envelope.auth.ts)) > 300000) throw new Error("unauthorized");
  }
  return envelope;
}

export class DanContractAdapter {
  constructor({ nodeId = "host", instanceId = "host", hmac = {}, maxMessageBytes = 262144, describe = {}, replayFile } = {}) {
    this.nodeId = nodeId;
    this.instanceId = instanceId;
    this.keys = new Map(Object.entries(hmac.keys || {}));
    this.keyId = hmac.keyId;
    this.keyBindings = new Map(Object.entries(hmac.bindings || {}));
    this.requireAuth = Boolean(hmac.required);
    this.maxMessageBytes = maxMessageBytes;
    this.describeInfo = describe;
    this.seen = new Map();
    this.maxSeen = Number.isInteger(hmac.maxSeen) ? hmac.maxSeen : 10000;
    this.maxNonces = Number.isInteger(hmac.maxNonces) ? hmac.maxNonces : 10000;
    this.nonces = new Map();
    this.tasks = new Map();
    this.idempotency = new Map();
    this.replayFile = replayFile;
    if (this.replayFile && existsSync(this.replayFile)) {
      try { chmodSync(this.replayFile, 0o600); const saved = JSON.parse(readFileSync(this.replayFile, "utf8")); for (const [id, entry] of (saved.seen || []).slice(-this.maxSeen)) this.seen.set(id, entry); for (const [nonce, expires] of (saved.nonces || []).slice(-this.maxNonces)) this.nonces.set(nonce, expires); for (const [key, entry] of (saved.idempotency || []).slice(-this.maxSeen)) this.idempotency.set(key, entry); } catch { /* corrupt replay state is ignored, never secrets */ }
    }
  }

  #persistReplay() {
    if (!this.replayFile) return;
    try {
      const seen = [...this.seen].map(([id, entry]) => {
        const response = entry.response && Buffer.byteLength(JSON.stringify(entry.response)) <= 65536 ? entry.response : undefined;
        return [id, { expires: entry.expires, ...(response ? { response } : {}) }];
      });
      const idempotency = [...this.idempotency].filter(([, entry]) => Buffer.byteLength(JSON.stringify(entry)) <= 65536).slice(-this.maxSeen);
      writeFileSync(this.replayFile, JSON.stringify({ seen, nonces: [...this.nonces], idempotency }), { mode: 0o600 });
      chmodSync(this.replayFile, 0o600);
    } catch { /* persistence failure never leaks credentials */ }
  }

  configureHmac({ keyId, secret, required = true } = {}) {
    if (typeof keyId !== "string" || !keyId || typeof secret !== "string" || !secret) throw new Error("keyId and secret are required");
    this.keys.set(keyId, secret);
    this.keyId = keyId;
    this.requireAuth = required;
    return { key_id: keyId, required };
  }

  dispose() { for (const task of this.tasks.values()) task.abortController?.abort(); this.tasks.clear(); this.idempotency.clear(); this.nonces.clear(); this.seen.clear(); }

  async dispatch(envelope, { strict = false } = {}) {
    validateEnvelope(envelope, { maxMessageBytes: this.maxMessageBytes, requireAuth: this.requireAuth || strict, strict });
    const secret = envelope.auth?.key_id ? this.keys.get(envelope.auth.key_id) : undefined;
    if ((this.requireAuth || strict) && (!secret || !verifyEnvelopeMac(envelope, secret))) throw new Error("unauthorized");
    if (strict && (!this.keyBindings.has(envelope.auth.key_id) || this.keyBindings.get(envelope.auth.key_id) !== envelope.sender)) throw new Error("unauthorized");
    if (strict && (this.nodeId === "host" || envelope.recipient !== this.nodeId)) throw new Error("unauthorized");
    if (strict && envelope.auth?.nonce) {
      const now = Date.now();
      for (const [nonce, expires] of this.nonces) if (expires <= now) this.nonces.delete(nonce);
      if (this.nonces.has(envelope.auth.nonce)) throw new Error("replay_detected");
      if (this.nonces.size >= this.maxNonces) this.nonces.delete(this.nonces.keys().next().value);
      this.nonces.set(envelope.auth.nonce, Date.parse(envelope.auth.ts) + 300000);
      this.#persistReplay();
    }
    const now = Date.now();
    for (const [messageId, entry] of this.seen) if (entry.expires <= now) this.seen.delete(messageId);
    if (this.seen.has(envelope.message_id)) return this.seen.get(envelope.message_id).response;
    const method = envelope.method || envelope.body?.method;
    if (envelope.kind !== "request" || typeof method !== "string" || !METHODS.has(method)) throw new Error("method_not_allowed");
    const params = envelope.body?.params || envelope.body || {};
    let result;
    if (method === "ping") result = { pong: true };
    else if (method === "describe") result = { protocol: DAN_PROTOCOL, node_id: this.nodeId, instance_id: this.instanceId, capabilities: ["rpc", "tasks"], events: false, ...this.describeInfo };
    else if (method === "message.send") {
      if (strict && (typeof params.idempotency_key !== "string" || !params.idempotency_key || Buffer.byteLength(params.idempotency_key) > 128)) throw new Error("invalid_envelope");
      const scope = `${envelope.sender}:${envelope.recipient}:${method}:${params.idempotency_key}`;
      const hash = createHash("sha256").update(canonical(params)).digest("hex");
      const prior = this.idempotency.get(scope); if (prior && prior.hash !== hash) throw new Error("idempotency_conflict");
      result = prior?.result || { accepted: true, queued: true, payload: params.payload }; this.idempotency.set(scope, { hash, result });
    } else if (method === "task.submit") {
      for (const field of ["task_id", "objective", "input", "idempotency_key", "deadline", "required_capabilities", "write_scopes"]) if (params[field] === undefined) throw new Error("invalid_envelope");
      if (typeof params.idempotency_key !== "string" || !params.idempotency_key || Buffer.byteLength(params.idempotency_key) > 128 || typeof params.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(params.deadline) || Number.isNaN(Date.parse(params.deadline)) || Date.parse(params.deadline) <= Date.now()) throw new Error("invalid_envelope");
      const scope = `${envelope.sender}:${envelope.recipient}:${method}:${params.idempotency_key}`; const hash = createHash("sha256").update(canonical(params)).digest("hex"); const prior = this.idempotency.get(scope); if (prior && prior.hash !== hash) throw new Error("idempotency_conflict");
      result = prior?.result || { task_id: params.task_id, status: "queued", lease_id: randomUUID(), lease_expires_at: params.deadline, attempt: 1 }; this.idempotency.set(scope, { hash, result }); this.tasks.set(params.task_id, { ...result, params, abortController: new AbortController() });
    } else if (method === "task.accept") {
      const task = this.tasks.get(params.task_id); if (!task) throw new Error("task_not_found"); if (task.status !== "queued") throw new Error("state_conflict"); if (Date.parse(task.lease_expires_at) <= Date.now()) throw new Error("lease_expired"); task.status = "running"; result = { task_id: task.task_id, status: "running", lease_id: task.lease_id, lease_expires_at: task.lease_expires_at };
    } else if (method === "task.result") {
      if (!params.result || typeof params.result !== "object" || Array.isArray(params.result)) throw new Error("invalid_envelope");
      const task = this.tasks.get(params.task_id); if (!task) throw new Error("task_not_found"); if (task.status !== "running") throw new Error("state_conflict"); if (Date.parse(task.lease_expires_at) <= Date.now()) throw new Error("lease_expired");
      const resultHash = createHash("sha256").update(canonical(params.result)).digest("hex"); result = { task_id: params.task_id, attempt: task.attempt, status: "succeeded", result_hash: resultHash }; this.tasks.set(params.task_id, { ...task, status: "succeeded", result: params.result });
    } else if (method === "task.cancel") { if (typeof params.idempotency_key !== "string" || !params.idempotency_key || Buffer.byteLength(params.idempotency_key) > 128) throw new Error("invalid_envelope"); const cancelScope = `${envelope.sender}:${envelope.recipient}:${method}:${params.idempotency_key}`; const cancelHash = createHash("sha256").update(canonical(params)).digest("hex"); const priorCancel = this.idempotency.get(cancelScope); if (priorCancel && priorCancel.hash !== cancelHash) throw new Error("idempotency_conflict"); if (priorCancel) { result = priorCancel.result; } else { const task = this.tasks.get(params.task_id); if (!task) throw new Error("task_not_found"); if (task.status === "cancelled") result = { task_id: params.task_id, status: "cancelled" }; else if (task.status === "succeeded" || task.status === "failed") throw new Error("state_conflict"); else { task.abortController?.abort(); task.status = "cancelled"; result = { task_id: params.task_id, status: "cancelled" }; } this.idempotency.set(cancelScope, { hash: cancelHash, result }); }
    }
     const response = { kind: "response", protocol: DAN_PROTOCOL, request_id: envelope.request_id, message_id: randomUUID(), reply_to: envelope.message_id, session_id: envelope.session_id, sender: this.nodeId, recipient: envelope.sender, sent_at: new Date().toISOString(), ttl_ms: envelope.ttl_ms, seq: 0, ok: true, result };
    if (this.keyId && this.keys.has(this.keyId)) response.auth = { key_id: this.keyId, mac: signEnvelope(response, this.keys.get(this.keyId)) };
    if (this.seen.size >= this.maxSeen) this.seen.delete(this.seen.keys().next().value);
    this.seen.set(envelope.message_id, { response, expires: Date.parse(envelope.sent_at) + envelope.ttl_ms });
    this.#persistReplay();
    return response;
  }
}

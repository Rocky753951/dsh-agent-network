import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DAN_PROTOCOL, DanContractAdapter, buildLocalEnvelope, canonical } from "./contract.js";

const LOOPBACK_ORIGIN = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i;
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i;
// Errors the loopback connector may report verbatim; everything else is folded
// into `invalid_envelope` so internal failure modes never leak through the API.
const LOCAL_DURATIONS = new Map([[900, "15m"], [3600, "1h"], [28800, "8h"], [86400, "24h"], [604800, "7d"]]);
const LOCAL_ERROR_CODES = new Set(["invalid_params", "unknown_operation", "invalid_envelope", "invalid_method", "method_not_allowed", "unauthorized", "forbidden", "pairing_not_found", "task_not_found", "revision_conflict", "state_conflict", "lease_expired", "replay_detected", "idempotency_conflict", "message_too_large", "invalid_json"]);

const json = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
};

const parseStrictJson = (text) => {
  if (text.charCodeAt(0) === 0xfeff || /(?:^|[,:])\s*-0(?:[\s,}\]])/.test(text) || /\b(?:NaN|Infinity|-Infinity)\b/.test(text)) throw new Error("invalid_json");
  const scopes = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i++; i++; }
      if (i >= text.length) throw new Error("invalid_json");
      const end = ++i; let j = end; while (/\s/.test(text[j] || "")) j++;
      if (text[j] === ":" && scopes.length) { const key = JSON.parse(text.slice(start, end)); if (scopes.at(-1).has(key)) throw new Error("invalid_json"); scopes.at(-1).add(key); }
      i = end - 1;
    } else if (text[i] === "{") scopes.push(new Set());
    else if (text[i] === "}") { if (!scopes.length) throw new Error("invalid_json"); scopes.pop(); }
  }
  if (scopes.length) throw new Error("invalid_json");
  const value = JSON.parse(text);
  if (canonical(value) !== text) throw new Error("invalid_json");
  return value;
};

const readBody = (req, { maxBytes = 1_048_576, strict = false } = {}) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) { reject(new Error("request_too_large")); return; }
    chunks.push(buffer);
  });
  req.on("end", () => {
    try {
      const bytes = Buffer.concat(chunks);
      if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error("invalid_json");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!text.trim()) throw new Error("invalid_json");
      resolve(strict ? parseStrictJson(text) : JSON.parse(text));
    } catch (error) { reject(new Error(error.message === "request_too_large" ? error.message : "invalid_json")); }
  });
  req.on("error", reject);
});

/**
 * Native HTTP/SSE transport used by the Host plugin. The class is deliberately
 * independent of Cordis so it can be tested and run as a small local service.
 */
export class AgentNetworkServer {
  constructor({ host = "127.0.0.1", port = 8787, logger = console, contract = {}, maxQueue = 1000, heartbeatMs = 15000, localToken = "", tokenFile = "", allowedOrigins = [] } = {}) {
    this.host = host;
    this.port = port;
    this.logger = logger;
    this.agents = new Map();
    this.queues = new Map();
    this.streams = new Map();
    if (!Number.isInteger(maxQueue) || maxQueue < 1 || maxQueue > 100000) throw new Error("maxQueue must be an integer between 1 and 100000");
    if (!Number.isInteger(heartbeatMs) || heartbeatMs < 1000) throw new Error("heartbeatMs must be at least 1000ms");
    this.maxQueue = maxQueue;
    this.heartbeatMs = heartbeatMs;
    this.heartbeat = null;
    this.contract = new DanContractAdapter(contract);
    // Connector identity pair: a loopback browser can act as the inviter (`host`)
    // and as the joiner (`<node>-peer`) so a single machine can rehearse a pairing.
    this.roles = { host: this.contract.nodeId, peer: `${this.contract.nodeId}-peer` };
    this.localToken = typeof localToken === "string" && localToken ? localToken : "";
    this.tokenFile = typeof tokenFile === "string" ? tokenFile : "";
    this.allowedOrigins = new Set(allowedOrigins.filter((origin) => typeof origin === "string" && origin));
    this.server = createServer((req, res) => this.#handle(req, res));
  }

  /**
   * Load or generate the loopback connector token and persist it with 0600
   * permissions. Reusing the file keeps the token stable across restarts, so a
   * reloaded page or a second DSH instance does not have to rediscover it.
   */
  ensureLocalToken() {
    if (!this.localToken && this.tokenFile) {
      try { const existing = readFileSync(this.tokenFile, "utf8").trim(); if (existing) this.localToken = existing; } catch { /* first run */ }
    }
    if (!this.localToken) this.localToken = randomBytes(32).toString("base64url");
    if (!this.tokenFile) return this.localToken;
    try {
      mkdirSync(dirname(this.tokenFile), { recursive: true, mode: 0o700 });
      writeFileSync(this.tokenFile, `${this.localToken}\n`, { mode: 0o600 });
      chmodSync(this.tokenFile, 0o600);
    } catch (error) { this.logger.warn?.("agent-network: could not persist connector token", error); }
    return this.localToken;
  }

  #originAllowed(origin) {
    if (!origin) return true;
    if (this.allowedOrigins.size) {
      // A configured allowlist is authoritative: this is the strict mode for
      // shared machines, where "anything on loopback" is too wide a trust set.
      return this.allowedOrigins.has(origin);
    }
    return LOOPBACK_ORIGIN.test(origin);
  }

  #tokenOk(req) {
    if (!this.localToken) return false;
    const provided = req.headers["x-agent-network-token"];
    if (typeof provided !== "string" || !provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(this.localToken);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async start() {
    if (this.server.listening) return this.address();
    this.ensureLocalToken();
    this.starting ??= new Promise((resolve, reject) => {
      const onError = (error) => { this.server.off("listening", onListening); this.starting = null; reject(error); };
      const onListening = () => { this.server.off("error", onError); resolve(); };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.port, this.host);
    });
    try { await this.starting; } finally { this.starting = null; }
    this.heartbeat = setInterval(() => { for (const streams of this.streams.values()) for (const stream of streams) if (!stream.destroyed) stream.write(": heartbeat\n\n"); }, this.heartbeatMs);
    this.heartbeat.unref?.();
    return this.address();
  }

  async stop() {
    // Disposal can race startup (a Host plugin torn down in the same tick it was
    // applied); waiting for the pending listen keeps the port from leaking open.
    if (this.starting) await this.starting.catch(() => {});
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const streams of this.streams.values()) for (const res of streams) res.end();
    this.streams.clear();
    this.queues.clear();
    this.contract.dispose?.();
    if (!this.server.listening) return;
    await new Promise((resolve) => {
      this.server.close(() => resolve());
      if (typeof this.server.closeAllConnections === "function") this.server.closeAllConnections();
    });
    this.started = false;
  }

  address() {
    const address = this.server.address();
    return typeof address === "object" && address ? { host: address.address, port: address.port } : null;
  }

  #roleForPairing(pairingId, preferred = "") {
    const record = this.contract.pairings.records.get(pairingId);
    if (!record) throw new Error("pairing_not_found");
    const field = preferred === "peer" ? "joiner" : "inviter";
    if (preferred && record[field] === this.roles[preferred]) return preferred;
    if (record.inviter === this.roles.host) return "host";
    if (record.joiner === this.roles.peer) return "peer";
    throw new Error("forbidden");
  }

  #pairingIdFromToken(token) {
    if (typeof token !== "string" || !token) throw new Error("unauthorized");
    const digest = createHash("sha256").update(token, "utf8").digest("hex");
    for (const record of this.contract.pairings.records.values()) if (record.token_hash && record.token_hash === digest) return record.pairing_id;
    throw new Error("pairing_not_found");
  }

  /**
   * Loopback connector: maps the panel's `{operation, payload}` calls onto DAN
   * methods, signs nothing, and picks the identity the operation is allowed to
   * act as. Remote peers still have to use the HMAC RPC route.
   */
  async localCall(operation, payload = {}) {
    // Every connector reply uses the DAN response envelope so the panel has one
    // shape to read, including the liveness probe.
    if (operation === "health") return { kind: "response", protocol: DAN_PROTOCOL, ok: true, result: this.health() };
    const plan = {
      describe: ["describe", "host"],
      discover: ["describe", "host"],
      message: ["message.send", "host"],
      submit: ["task.submit", "host"],
      cancel: ["task.cancel", "host"],
      "invite.create": ["pair.invite.create", "host"],
      "join.request": ["pair.join.request", "peer"],
      approve: ["pair.approve", "host"],
      reject: ["pair.reject", "host"],
      "session.open": ["pair.session.open", "peer"],
      revoke: ["pair.revoke", "host"],
      status: ["task.status", "host"]
    }[operation];
    if (!plan) throw new Error("method_not_allowed");
    let [method, role] = plan;
    const params = { ...payload };
    if (operation === "status" && params.pairing_id) method = "pair.status";
    if (method === "pair.join.request") params.pairing_id = params.pairing_id || this.#pairingIdFromToken(params.token ?? params.invite_code);
    // The pairing operations act as whichever local role that pairing already
    // assigned to this node; guessing wrong is what makes a single-machine
    // rehearsal fail with `forbidden`.
    if (method === "pair.status") role = this.#roleForPairing(params.pairing_id);
    else if (method === "pair.join.request") role = "peer";
    else if (["pair.approve", "pair.reject", "pair.revoke"].includes(method)) role = this.#roleForPairing(params.pairing_id, "host");
    else if (method === "pair.session.open") role = this.#roleForPairing(params.pairing_id, "peer");
    if (["pair.invite.create", "pair.approve"].includes(method)) {
      // Only forward what the caller actually chose: sending an empty allow list
      // on approve would silently wipe the scopes the invitation carried.
      if (Array.isArray(params.permissions)) params.permissions = { allow: params.permissions };
      else if (params.permissions && typeof params.permissions === "object" && Object.keys(params.permissions).length) params.permissions = { ...params.permissions };
      else delete params.permissions;
      // The panel works in seconds; the protocol stores a duration enum.
      if (typeof params.duration === "number") {
        const duration = LOCAL_DURATIONS.get(params.duration);
        if (!duration) throw new Error("invalid_params");
        params.duration = duration;
      }
    }
    if (["message.send", "task.submit", "task.cancel", "pair.invite.create"].includes(method) && typeof params.idempotency_key !== "string") params.idempotency_key = randomUUID();
    const recipient = typeof payload.recipient === "string" && payload.recipient ? payload.recipient : typeof payload.target === "string" && payload.target ? payload.target : this.roles.host;
    const envelope = buildLocalEnvelope({ sender: this.roles[role] || this.roles.host, recipient, method, params, sessionId: typeof payload.session_id === "string" ? payload.session_id : undefined });
    return this.contract.dispatch(envelope);
  }

  bridgeConfig() {
    const address = this.address();
    const origin = address ? `http://${address.host.includes(":") ? `[${address.host}]` : address.host}:${address.port}` : "";
    return { ok: true, service: "dsh-agent-network", protocol: DAN_PROTOCOL, connector: { url: origin, endpoint: "/api/agent-network/v1/local", token: this.localToken, roles: this.roles } };
  }

  register({ agentId, metadata = {} } = {}) {
    const id = agentId || randomUUID();
    this.agents.set(id, { agentId: id, metadata, registeredAt: new Date().toISOString() });
    if (!this.queues.has(id)) this.queues.set(id, []);
    return this.agents.get(id);
  }

  send({ from = "host", to, payload, id = randomUUID() } = {}) {
    const message = { id, from, to: to || null, payload, timestamp: new Date().toISOString() };
    const targets = to ? [to] : [...this.agents.keys()];
    for (const target of targets) {
      if (!this.agents.has(target)) continue;
      const queue = this.queues.get(target) || [];
      if (queue.length >= this.maxQueue) throw new Error("queue_full");
      queue.push(message);
      this.queues.set(target, queue);
      this.#emit(target, message);
    }
    return message;
  }

  receive(agentId, { drain = true } = {}) {
    const queue = this.queues.get(agentId) || [];
    if (drain) this.queues.set(agentId, []);
    return queue;
  }

  health() {
    const queueDepth = [...this.queues.values()].reduce((total, queue) => total + queue.length, 0);
    const streamConnections = [...this.streams.values()].reduce((total, streams) => total + streams.size, 0);
    return { ok: true, service: "dsh-agent-network", agents: this.agents.size, streams: streamConnections, queue_depth: queueDepth, queue_limit: this.maxQueue, address: this.address() };
  }

  #emit(agentId, message) {
    const streams = this.streams.get(agentId) || new Set();
    for (const stream of streams) { if (stream.destroyed) { streams.delete(stream); continue; } if (!stream.write(`data: ${JSON.stringify(message)}\n\n`)) stream.once("drain", () => {}); }
  }

  async #readJson(req, res) {
    try { return await readBody(req); }
    catch (error) {
      const code = error.message === "invalid_json" ? "invalid_json" : error.message === "request_too_large" || error.message === "message_too_large" ? "message_too_large" : "invalid_envelope";
      const message = { kind: "response", protocol: "dan/0.1", ok: false, error: { code, message: code, retryable: false } };
      json(res, code === "message_too_large" ? 413 : 400, message);
      const rejection = new Error("responded");
      rejection.responded = true;
      throw rejection;
    }
  }

  async #handle(req, res) {
    const url = new URL(req.url || "/", `http://${this.host}`);
    // DAN/0.1 is the small demo API namespace; unversioned aliases remain for local compatibility.
    const pathname = url.pathname.replace(/^\/dan\/0\.1(?=\/|$)/, "") || "/";
    const isFormalRpc = url.pathname === "/api/agent-network/v1/rpc";
    const isLocalRpc = url.pathname === "/api/agent-network/v1/local";
    const isBridgeConfig = url.pathname === "/api/agent-network/v1/bridge-config";
    const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    const errorResponse = (status, code, message = code, replyTo) => json(res, status, { kind: "response", protocol: "dan/0.1", ...(replyTo ? { reply_to: replyTo } : {}), ok: false, error: { code, message, retryable: false } });
    // Browser boundary: a remote page must never reach this loopback service, and
    // a rebound DNS name must never satisfy the Host header.
    const origin = String(req.headers.origin || "");
    if (!this.#originAllowed(origin)) return json(res, 403, { ok: false, error: { code: "origin_not_allowed", message: "origin_not_allowed" } });
    const hostHeader = String(req.headers.host || "");
    if (hostHeader && !LOOPBACK_HOST.test(hostHeader)) return json(res, 403, { ok: false, error: { code: "invalid_host", message: "invalid_host" } });
    if (origin) { res.setHeader("access-control-allow-origin", origin); res.setHeader("vary", "origin"); }
    res.setHeader("access-control-allow-headers", "content-type,x-agent-network-token,x-dsh-protocol-version");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-max-age", "600");
    // The panel is served from another origin, so its preflight must succeed
    // before any token can be sent: answer OPTIONS ahead of the token gate. The
    // formal HMAC route stays JSON-only and keeps rejecting OPTIONS.
    if (req.method === "OPTIONS" && !isFormalRpc) { res.writeHead(204); return res.end(); }
    const requiresToken = isLocalRpc || (!isFormalRpc && !isBridgeConfig && new Set(["/rpc", "/register", "/send", "/receive"]).has(pathname));
    if (requiresToken && !this.#tokenOk(req)) return json(res, 401, { ok: false, error: { code: "unauthorized", message: "connector token required (x-agent-network-token)" } });
    try {
      if (isBridgeConfig) {
        if (req.method !== "GET") return errorResponse(405, "method_not_allowed");
        res.setHeader("cache-control", "no-store");
        return json(res, 200, this.bridgeConfig());
      }
      if (isLocalRpc) {
        if (req.method !== "POST") return errorResponse(405, "method_not_allowed");
        if (contentType !== "application/json") return errorResponse(400, "invalid_content_type");
        let incoming;
        try {
          incoming = await readBody(req);
          if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return errorResponse(400, "invalid_envelope");
          const operation = incoming.operation;
          if (typeof operation !== "string" || !operation) return errorResponse(400, "invalid_method");
          const payload = incoming.payload && typeof incoming.payload === "object" && !Array.isArray(incoming.payload) ? incoming.payload : {};
          return json(res, 200, await this.localCall(operation, payload));
        } catch (error) {
          // An unsupported connector operation is a caller mistake, not a missing route.
          const code = error.message === "method_not_allowed" ? "unknown_operation" : LOCAL_ERROR_CODES.has(error.message) ? error.message : "invalid_envelope";
          const status = code === "forbidden" ? 403 : code === "unauthorized" ? 401 : ["pairing_not_found", "task_not_found"].includes(code) ? 404 : ["revision_conflict", "state_conflict", "lease_expired", "replay_detected"].includes(code) ? 409 : 400;
          return errorResponse(status, code, code);
        }
      }
      if (isFormalRpc) {
        if (req.method !== "POST") return errorResponse(405, "method_not_allowed");
        if (contentType !== "application/json") return errorResponse(400, "invalid_content_type");
        let incoming;
        try { incoming = await readBody(req, { strict: true }); return json(res, 200, await this.contract.dispatch(incoming, { strict: true })); }
        catch (error) {
          const code = error.message === "forbidden" ? "forbidden" : error.message === "unauthorized" ? "unauthorized" : error.message === "replay_detected" ? "replay_detected" : error.message === "idempotency_conflict" ? "idempotency_conflict" : error.message === "task_not_found" ? "task_not_found" : error.message === "state_conflict" ? "state_conflict" : error.message === "lease_expired" ? "lease_expired" : error.message === "pairing_not_found" ? "pairing_not_found" : error.message === "revision_conflict" ? "revision_conflict" : error.message === "request_too_large" || error.message === "message_too_large" ? "message_too_large" : error.message === "invalid_json" ? "invalid_json" : error.message === "unsupported_version" ? "unsupported_version" : error.message === "method_not_allowed" ? "invalid_method" : "invalid_envelope";
          return errorResponse(code === "forbidden" ? 403 : code === "unauthorized" ? 401 : ["replay_detected", "idempotency_conflict", "state_conflict", "lease_expired", "revision_conflict"].includes(code) ? 409 : code === "task_not_found" || code === "invalid_method" ? 404 : code === "message_too_large" ? 413 : 400, code, code, incoming?.message_id);
        }
      }
      if (req.method === "POST" && pathname === "/rpc") {
        try { return json(res, 200, await this.contract.dispatch(await readBody(req))); }
        catch (error) { return json(res, 400, { kind: "response", protocol: "dan/0.1", body: { ok: false, error: { code: error.message } } }); }
      }
      if (req.method === "GET" && pathname === "/health") return json(res, 200, this.health());
      if (req.method === "POST" && pathname === "/register") return json(res, 200, this.register(await this.#readJson(req, res)));
      if (req.method === "POST" && pathname === "/send") return json(res, 200, this.send(await this.#readJson(req, res)));
      if (req.method === "GET" && pathname === "/receive") {
        const agentId = url.searchParams.get("agentId");
        if (!agentId || !this.agents.has(agentId)) return json(res, 404, { error: "unknown agent" });
        if (url.searchParams.get("stream") === "1") return errorResponse(404, "events_disabled");
        return json(res, 200, { messages: this.receive(agentId, { drain: url.searchParams.get("drain") !== "0" }) });
      }
      if (url.pathname.startsWith("/api/agent-network/v1/")) return errorResponse(404, "not_found");
      return json(res, 404, { error: "not found" });
    } catch (error) {
      if (error?.responded || res.headersSent) return;
      this.logger.error?.(error);
      return errorResponse(500, "internal_error");
    }
  }
}

export const createAgentNetworkServer = (options) => new AgentNetworkServer(options);

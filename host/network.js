import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { DanContractAdapter, canonical } from "./contract.js";

const json = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "access-control-allow-origin": "*" });
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
  constructor({ host = "127.0.0.1", port = 8787, logger = console, contract = {}, maxQueue = 1000, heartbeatMs = 15000 } = {}) {
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
    this.server = createServer((req, res) => this.#handle(req, res));
  }

  async start() {
    if (this.server.listening) return this.address();
    await new Promise((resolve, reject) => {
      const onError = (error) => { this.server.off("listening", onListening); reject(error); };
      const onListening = () => { this.server.off("error", onError); resolve(); };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.port, this.host);
    });
    this.heartbeat = setInterval(() => { for (const streams of this.streams.values()) for (const stream of streams) if (!stream.destroyed) stream.write(": heartbeat\n\n"); }, this.heartbeatMs);
    this.heartbeat.unref?.();
    return this.address();
  }

  async stop() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const streams of this.streams.values()) for (const res of streams) res.end();
    this.streams.clear();
    this.queues.clear();
    this.contract.dispose?.();
    if (!this.server.listening) return;
    await new Promise((resolve) => this.server.close(() => resolve()));
  }

  address() {
    const address = this.server.address();
    return typeof address === "object" && address ? { host: address.address, port: address.port } : null;
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

  async #handle(req, res) {
    const url = new URL(req.url || "/", `http://${this.host}`);
    // DAN/0.1 is the small demo API namespace; unversioned aliases remain for local compatibility.
    const pathname = url.pathname.replace(/^\/dan\/0\.1(?=\/|$)/, "") || "/";
    const isFormalRpc = url.pathname === "/api/agent-network/v1/rpc";
    const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    const errorResponse = (status, code, message = code, replyTo) => json(res, status, { kind: "response", protocol: "dan/0.1", ...(replyTo ? { reply_to: replyTo } : {}), ok: false, error: { code, message, retryable: false } });
    try {
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
      if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" }); return res.end(); }
      if (req.method === "POST" && pathname === "/rpc") {
        try { return json(res, 200, await this.contract.dispatch(await readBody(req))); }
        catch (error) { return json(res, 400, { kind: "response", protocol: "dan/0.1", body: { ok: false, error: { code: error.message } } }); }
      }
      if (req.method === "GET" && pathname === "/health") return json(res, 200, this.health());
      if (req.method === "POST" && pathname === "/register") return json(res, 200, this.register(await readBody(req)));
      if (req.method === "POST" && pathname === "/send") return json(res, 200, this.send(await readBody(req)));
      if (req.method === "GET" && pathname === "/receive") {
        const agentId = url.searchParams.get("agentId");
        if (!agentId || !this.agents.has(agentId)) return json(res, 404, { error: "unknown agent" });
        if (url.searchParams.get("stream") === "1") return errorResponse(404, "events_disabled");
        return json(res, 200, { messages: this.receive(agentId, { drain: url.searchParams.get("drain") !== "0" }) });
      }
      if (url.pathname.startsWith("/api/agent-network/v1/")) return errorResponse(404, "not_found");
      return json(res, 404, { error: "not found" });
    } catch (error) { this.logger.error?.(error); return errorResponse(500, "internal_error"); }
  }
}

export const createAgentNetworkServer = (options) => new AgentNetworkServer(options);

import { AgentNetworkServer } from "./network.js";

export const inject = ["tools"];

const output = {
  schema: { type: "json" },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
};

const tool = (name, description, parameters, execute) => ({ name, description, parameters, output, execute });
const activeContexts = new WeakSet();

/** DSH Host plugin entry point. */
export function apply(ctx, config = {}) {
  if (ctx && activeContexts.has(ctx)) throw new Error("agent-network: duplicate apply");
  if (ctx && typeof ctx === "object") activeContexts.add(ctx);
  const host = config.host || "127.0.0.1";
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) throw new Error("agent-network: Host plugin is loopback-only (use 127.0.0.1, localhost, or ::1)");
  const server = new AgentNetworkServer({
    host,
    port: Number.isInteger(config.port) ? config.port : 8787,
    logger: ctx.logger || console,
    contract: config.contract || {}
  });
  const register = ctx.tools.register.bind(ctx.tools);
  const disposers = [
    register(tool("agent_network_register", "Register an Agent with the local Host network bridge.", { agentId: { type: "string" }, metadata: { type: "json" } }, (args) => server.register(args))),
    register(tool("agent_network_send", "Send a JSON payload to one Agent, or broadcast when to is omitted.", { from: { type: "string" }, to: { type: "string" }, payload: { type: "json", required: true } }, (args) => server.send(args))),
    register(tool("agent_network_receive", "Read queued messages for a registered Agent.", { agentId: { type: "string", required: true }, drain: { type: "boolean" } }, (args) => ({ messages: server.receive(args.agentId, { drain: args.drain !== false }) }))),
    register(tool("agent_network_health", "Check the local Agent network bridge health and connected counts.", {}, () => server.health()))
  ];
  server.ready = server.start();
  server.ready.catch((error) => ctx.logger?.error?.("agent-network: failed to start", error));
  ctx.effect(() => {
    // `ready` is exposed so lifecycle harnesses can await startup/port failures.
    server.ready;
    return async () => { await server.stop(); for (const dispose of disposers) await dispose?.(); activeContexts.delete(ctx); };
  }, "agent-network: server and tools");
  return server;
}

export { AgentNetworkServer } from "./network.js";

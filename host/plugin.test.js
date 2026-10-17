import test from "node:test";
import assert from "node:assert/strict";
import { apply } from "./index.js";

const stubContext = () => {
  const tools = new Map();
  const ctx = {
    logger: { warn() {}, error() {}, info() {} },
    tools: { register: (tool) => { assert.ok(!tools.has(tool.name), `duplicate tool ${tool.name}`); tools.set(tool.name, tool); return () => tools.delete(tool.name); } },
    effect: (factory) => { ctx.effects.push(factory); }
  };
  ctx.effects = [];
  return { ctx, tools };
};

const assertJsonSchema = (schema, path = "root") => {
  assert.ok(["object", "array", "string", "number", "integer", "boolean", "null"].includes(schema.type), `${path}.type = ${schema.type}`);
  if (schema.properties) for (const [name, child] of Object.entries(schema.properties)) assertJsonSchema(child, `${path}.${name}`);
  if (schema.items) assertJsonSchema(schema.items, `${path}[]`);
};

test("the Host plugin registers JSON-Schema tools and a loopback server", async (t) => {
  const { ctx, tools } = stubContext();
  const server = apply(ctx, { port: 0 });
  await server.ready;
  t.after(async () => { for (const factory of ctx.effects) await factory()(); });

  assert.deepEqual([...tools.keys()].sort(), ["agent_network_health", "agent_network_receive", "agent_network_register", "agent_network_send"]);
  for (const [name, tool] of tools) {
    assertJsonSchema(tool.parameters, name);
    assert.equal(tool.parameters.type, "object");
    assert.equal(tool.output.schema.type, "object");
  }
  assert.equal(tools.get("agent_network_send").parameters.required.includes("payload"), true);
  assert.equal(tools.get("agent_network_send").parameters.properties.metadata, undefined);

  const registered = tools.get("agent_network_register").execute({ agentId: "agent-a", metadata: { role: "tester" } });
  assert.equal(registered.agentId, "agent-a");
  tools.get("agent_network_send").execute({ from: "agent-a", to: "agent-a", payload: { text: "hi" } });
  assert.equal(tools.get("agent_network_receive").execute({ agentId: "agent-a" }).messages.length, 1);
  assert.equal(tools.get("agent_network_health").execute({}).agents, 1);

  const address = server.address();
  assert.equal(address.host, "127.0.0.1");
  const config = await fetch(`http://127.0.0.1:${address.port}/api/agent-network/v1/bridge-config`, { headers: { origin: "http://127.0.0.1:33080" } }).then((response) => response.json());
  assert.equal(config.connector.url, `http://127.0.0.1:${address.port}`);
});

test("a second apply on the same context is rejected and non-loopback binds are refused", async (t) => {
  const { ctx } = stubContext();
  apply(ctx, { port: 0 });
  t.after(async () => { for (const factory of ctx.effects) await factory()(); });
  assert.throws(() => apply(ctx, { port: 0 }), /duplicate apply/);
  const other = stubContext();
  assert.throws(() => apply(other.ctx, { host: "0.0.0.0" }), /loopback-only/);
  assert.equal(other.tools.size, 0);
});

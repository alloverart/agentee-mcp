// Smoke test: start the stdio server the way an MCP client does, list its
// tools and make one call. The endpoint points nowhere, so the test runs
// offline against the bundled tools.json and never touches the live store.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const bundled = JSON.parse(readFileSync(new URL("../tools.json", import.meta.url), "utf8")).tools;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL("../server.js", import.meta.url).pathname],
  env: { ...process.env, AGENTEE_ENDPOINT: "http://127.0.0.1:9/mcp", AGENTEE_TOKEN: "" },
});
const client = new Client({ name: "agentee-smoke", version: "1.0.0" });
await client.connect(transport);

try {
  const { tools } = await client.listTools();
  assert.equal(tools.length, bundled.length, "server lists every bundled tool");
  for (const t of tools) {
    assert.ok(t.description?.length > 20, `${t.name} has a real description`);
    assert.equal(t.inputSchema?.type, "object", `${t.name} has an object input schema`);
  }
  assert.ok(tools.some((t) => t.name === "search_products"), "search_products is listed");

  // An unreachable store must come back as a tool error, not a crash.
  const res = await client.callTool({ name: "search_products", arguments: { query: "cat" } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Could not reach/);

  console.log(`ok: ${tools.length} tools listed, offline call handled`);
} finally {
  await client.close();
}

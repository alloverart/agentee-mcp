#!/usr/bin/env node
// AgenTee over stdio: the same tools as the hosted server at https://allover.art/mcp.
// Tool definitions ship with the package (tools.json), so the server starts and
// lists its tools offline; calls go to the allover.art API with your token.
import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const ENDPOINT = process.env.AGENTEE_ENDPOINT || "https://allover.art/mcp";
const TOKEN = (process.env.AGENTEE_TOKEN || "").trim();
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
let tools = JSON.parse(readFileSync(new URL("./tools.json", import.meta.url), "utf8")).tools;

let nextId = 1;
async function rpc(method, params, timeoutMs) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
                    "User-Agent": `agentee-mcp/${pkg.version}` };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST", headers, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    });
  } catch (e) {
    throw new Error(`Could not reach ${ENDPOINT}: ${e?.cause?.code || e?.cause?.errors?.[0]?.code || e?.message || e}`);
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) {
    throw new Error("This tool needs a personal token: get one free at https://allover.art/agentee " +
                    "and set AGENTEE_TOKEN in the server's environment.");
  }
  if (!res.ok || !body) throw new Error(`allover.art answered HTTP ${res.status}`);
  if (body.error) throw new Error(body.error.message || "allover.art returned an error");
  return body.result;
}

const server = new Server({ name: "agentee-mcp", version: pkg.version }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return await rpc("tools/call", req.params, 90_000);
  } catch (e) {
    return { content: [{ type: "text", text: String(e?.message || e) }], isError: true };
  }
});

// The live list wins when the store is reachable; the bundled one covers offline starts.
rpc("tools/list", {}, 4_000)
  .then((r) => { if (Array.isArray(r?.tools) && r.tools.length) tools = r.tools; })
  .catch(() => {});

await server.connect(new StdioServerTransport());

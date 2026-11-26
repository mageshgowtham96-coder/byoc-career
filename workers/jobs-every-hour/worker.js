const UPSTREAM = "https://jobseveryhour.com/mcp";
const MCP_VERSION = "2025-06-18";
const MAX_QUERY_LENGTH = 160;
const MAX_LIMIT = 10;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, status = 200, origin = "*") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

async function readMcpResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) throw new Error(`Upstream MCP HTTP ${response.status}: ${text.slice(0, 500)}`);
  if (contentType.includes("text/event-stream")) {
    const events = text.split(/\r?\n\r?\n/);
    for (const event of events.reverse()) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
      if (data) {
        try { return JSON.parse(data); } catch {}
      }
    }
    throw new Error("MCP stream contained no JSON response.");
  }
  try { return JSON.parse(text); } catch {
    throw new Error("MCP returned an invalid JSON response.");
  }
}

async function mcpCall(method, params, id, sessionId, protocolVersion) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": protocolVersion || MCP_VERSION
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const response = await fetch(UPSTREAM, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  const body = await readMcpResponse(response);
  return { body, sessionId: response.headers.get("Mcp-Session-Id") || sessionId, protocolVersion: body?.result?.protocolVersion || protocolVersion || MCP_VERSION };
}

async function callTool(name, args) {
  const init = await mcpCall("initialize", {
    protocolVersion: MCP_VERSION,
    capabilities: {},
    clientInfo: { name: "BYOC-Bridge", version: "0.1.0" }
  }, 1);
  if (init.body?.error) throw new Error(init.body.error.message || "MCP initialization failed.");
  const initializedHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": init.protocolVersion
  };
  if (init.sessionId) initializedHeaders["Mcp-Session-Id"] = init.sessionId;
  await fetch(UPSTREAM, {
    method: "POST",
    headers: initializedHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
  });
  const called = await mcpCall("tools/call", { name, arguments: args }, 2, init.sessionId, init.protocolVersion);
  if (called.body?.error) throw new Error(called.body.error.message || `MCP tool ${name} failed.`);
  const result = called.body?.result;
  if (result?.isError) {
    const message = (result.content || []).map(item => item.text || "").join("\n");
    throw new Error(message || `MCP tool ${name} returned an error.`);
  }
  return result;
}

function unwrapToolResult(result) {
  if (result?.structuredContent) return result.structuredContent;
  const textPart = (result?.content || []).find(item => item.type === "text" && typeof item.text === "string");
  if (textPart) {
    try { return JSON.parse(textPart.text); } catch { return { text: textPart.text }; }
  }
  return result;
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "*";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, provider: "Jobs Every Hour MCP", bridge: "BYOC Worker", configured: true }, 200, origin);
    }

    if (request.method !== "POST") return json({ error: "Use POST for /search and /job." }, 405, origin);

    try {
      const body = await request.json();
      if (url.pathname === "/search") {
        const query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_LENGTH) : "";
        if (!query) return json({ error: "A job search query is required." }, 400, origin);
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(body.limit) ? Math.floor(body.limit) : 10));
        const result = unwrapToolResult(await callTool("search_jobs", {
          query,
          limit,
          ...(body.remote_only === true ? { remote_only: true } : {})
        }));
        return json({ provider: "Jobs Every Hour", attribution: "https://jobseveryhour.com/", query, result }, 200, origin);
      }

      if (url.pathname === "/job") {
        const job = typeof body.job === "string" ? body.job.trim().slice(0, 2048) : "";
        if (!job || !/^https:\/\/jobseveryhour\.com\/job\//i.test(job) && !/^[a-z0-9-]{3,}$/i.test(job)) {
          return json({ error: "Provide a Jobs Every Hour job slug or job page URL." }, 400, origin);
        }
        const result = unwrapToolResult(await callTool("get_job", { job }));
        return json({ provider: "Jobs Every Hour", attribution: "https://jobseveryhour.com/", result }, 200, origin);
      }

      return json({ error: "Not found." }, 404, origin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Bridge request failed." }, 502, origin);
    }
  }
};

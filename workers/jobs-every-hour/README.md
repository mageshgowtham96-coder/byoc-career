# BYOC Jobs Every Hour Bridge (Cloudflare Worker)

This Worker is a serverless HTTP bridge from BYOC to Jobs Every Hour's hosted MCP endpoint. It is not a continuously running server and requires no provider API key.

## Routes

- `GET /health` — bridge health check (does not contact the provider).
- `POST /search` — JSON `{ "query": "registered nurse", "limit": 10, "remote_only": false }`; calls MCP `search_jobs`.
- `POST /job` — JSON `{ "job": "<slug or JHE job URL>" }`; calls MCP `get_job` for the full posting.

## Deploy

1. Create/sign into a Cloudflare account.
2. Install Wrangler locally: `npm install -g wrangler` (or use `npx wrangler`).
3. From this folder run `npx wrangler login`.
4. Deploy: `npx wrangler deploy`.
5. Check the printed `workers.dev` URL and visit `/health`.

No secrets or API keys are required. The Worker intentionally does not proxy arbitrary URLs.

## Important limitations / security

- This is a prototype bridge. The upstream MCP server's protocol and tool schema may change.
- The upstream `search_jobs` tool is described as searching **open tech jobs**; occupational coverage outside technology must be validated before BYOC relies on it.
- The Worker has permissive CORS for the prototype. Before public deployment, restrict allowed origins and add abuse/rate-limit controls if BYOC is widely accessible.
- Live provider requests and end-to-end UI integration have not yet been verified.
- Attribute Jobs Every Hour and retain links back to its job pages / employer apply URLs.

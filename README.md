# Agent Workflow Template

A bare-bones agentic workflow template powered by Cloudflare Workers AI. It demonstrates the core loop used by many AI agents: plan, call allowlisted tools, inspect results, and stream a final answer.

<!-- dash-content-start -->

## Demo

This template demonstrates how to build a minimal agentic workflow using Cloudflare Workers AI with streamed progress. It features:

- Planner step that asks the model which tools to use
- Reusable markdown skills for repeatable workflow recipes
- Allowlisted server-side tools with demo results
- Optional remote MCP tool bridge
- Real-time status, tool output, and final answer streaming using Server-Sent Events (SSE)
- Easy customization of models, prompts, and tools
- AI Gateway integration support
- Clean, responsive UI that works on mobile and desktop

## Features

- Simple and responsive workflow interface
- Skill picker for reusable agent workflows
- Server-Sent Events (SSE) for streaming agent progress
- Demo tools for runbook search, account lookup, and task creation
- Optional MCP server connection through a single allowlisted tool bridge
- Cloudflare Workers AI LLM support
- TypeScript and Cloudflare Workers stack
- Mobile-friendly design
- Built-in observability logging
<!-- dash-content-end -->

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- A Cloudflare account with Workers AI access
- Authentication with Wrangler: run `npx wrangler login` (Wrangler is included as a dev dependency)

### Installation

1. Clone this repository:

   ```bash
   git clone <repository-url>
   cd agent-workflow-template
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

### Development

Start a local development server:

```bash
npm run dev
```

This will start a local server at http://localhost:8787.

> **Note:** Workers AI requests go to your Cloudflare account even during local development. This incurs usage charges. See [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

The deploy command will output your Worker's URL (e.g., `https://agent-workflow-template.<your-subdomain>.workers.dev`).

### Monitor

View real-time logs associated with any deployed Worker:

```bash
npx wrangler tail
```

## Project Structure

```
/
├── public/             # Static assets
│   ├── index.html      # Agent workflow UI HTML
│   ├── chat.js         # Agent workflow frontend script
│   └── skills/         # Public markdown skill recipes
├── src/
│   ├── index.ts        # Main Worker entry point
│   └── types.ts        # TypeScript type definitions
├── wrangler.jsonc      # Cloudflare Worker configuration
├── tsconfig.json       # TypeScript configuration
└── README.md           # This documentation
```

## How It Works

### Backend

The backend is built with Cloudflare Workers and uses Workers AI for planning and response generation. The main components are:

1. **Skill Manifest** (`/api/skills`): Returns the list of available skills for the UI picker.
2. **API Endpoint** (`/api/agent`): Accepts POST requests with chat-style messages and an optional selected skill.
3. **Planning**: Loads the selected skill, then asks Workers AI to return a JSON plan with up to two tool calls.
4. **Tool Execution**: Runs only allowlisted server-side tools defined in `src/index.ts`.
5. **Final Answer**: Sends the skill, plan, and tool results back to Workers AI, then streams the final answer.
6. **Workers AI Binding**: Connects to Cloudflare's AI service via the Workers AI binding.

If MCP is configured, the planner can also use `call_mcp_tool` to call an allowlisted tool exposed by a remote MCP server.

### Frontend

The frontend is a simple HTML/CSS/JavaScript application that:

1. Presents a workflow prompt interface.
2. Loads available skills from `/api/skills`.
3. Sends user requests and the selected skill to `/api/agent`.
4. Displays planning, status updates, tool results, and the streamed final answer.
5. Maintains chat history on the client side.

## Example Prompt

Try this locally after running `npm run dev`:

```text
Triage an AI Gateway rollout for account 123 and create a follow-up task if anything is missing.
```

The demo tools return mock data. They are intentionally small so you can replace them with real integrations.

## Customization

### Adding Reusable Skills

Skills are lightweight markdown workflow recipes. Think of them as reusable prompt + tool templates. They are intentionally simple so the template stays easy to understand.

The starter skills live in `public/skills/`:

- `triage.md`
- `customer-research.md`

Each skill has YAML-style frontmatter plus instructions:

```markdown
---
name: triage
description: Triage an operational issue, inspect context, and recommend next steps.
tools:
  - search_runbook
  - lookup_account
---

# Triage Skill

Use this skill when the user wants help investigating an operational issue.
```

To add a skill:

1. Create a new markdown file under `public/skills/` with YAML frontmatter.
2. Add it to the `SKILLS` array in `src/index.ts`.
3. List the tools the skill can use in its `tools` frontmatter (these filter what the model can call).
4. Run `npm run check` to verify TypeScript compiles and the Worker builds correctly.

When a skill declares tools, the Worker filters the model's plan to those tools before execution. For MCP tools, use the `mcp:<tool-name>` form and make sure the same tool name is also present in `MCP_TOOL_ALLOWLIST`:

```markdown
---
name: docs-research
description: Search product docs through a remote MCP server.
tools:
  - mcp:search_docs
---
```

Skill files in this template are public static assets. Do not put secrets, private tokens, or customer-specific confidential data in them. For production systems, store private context in D1, R2, KV, Workers AI Vectorize, or behind authenticated MCP tools.

### Changing the Model

To use a different AI model, update the `MODEL_ID` constant in `src/index.ts`. You can find available models in the [Cloudflare Workers AI documentation](https://developers.cloudflare.com/workers-ai/models/).

### Using AI Gateway

The template includes commented code for AI Gateway integration, which provides additional capabilities like rate limiting, caching, and analytics.

To enable AI Gateway:

1. [Create an AI Gateway](https://dash.cloudflare.com/?to=/:account/ai/ai-gateway) in your Cloudflare dashboard
2. Uncomment the gateway configuration in `src/index.ts`
3. Replace `YOUR_GATEWAY_ID` with your actual AI Gateway ID
4. Configure other gateway options as needed:
   - `skipCache`: Set to `true` to bypass gateway caching
   - `cacheTtl`: Set the cache time-to-live in seconds

Learn more about [AI Gateway](https://developers.cloudflare.com/ai-gateway/).

### Adding Real Tools

The sample tools live in `src/index.ts`:

- `search_runbook`
- `lookup_account`
- `create_follow_up_task`

Replace these with your own calls to Cloudflare services or external systems. Common next steps include:

- Query account or customer state from D1, KV, R2, or a third-party API
- Start long-running work with Cloudflare Workflows or Queues
- Coordinate per-user or per-agent state with Durable Objects
- Route model traffic through AI Gateway for logging, caching, rate limiting, and analytics

Keep tool execution server-side and allowlisted. Do not let the model call arbitrary URLs, run arbitrary code, or choose unvalidated operations.

### Connecting MCP Servers

This template includes an optional MCP bridge for remote MCP servers that support [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) transport. MCP is disabled by default.

To enable MCP:

1. Set the remote MCP endpoint in `wrangler.jsonc`:

```jsonc
"vars": {
	"MCP_SERVER_URL": "https://your-mcp-server.example.com/mcp",
	"MCP_TOOL_ALLOWLIST": "search_docs,create_ticket"
}
```

2. If your MCP server requires bearer auth, store the token as a secret:

```bash
npx wrangler secret put MCP_AUTH_TOKEN
```

3. Ask the agent to use one of the allowlisted MCP tools:

```text
Search docs for the latest AI Gateway caching guidance and summarize the rollout steps.
```

The Worker sends MCP tool calls as JSON-RPC `tools/call` requests:

```json
{
	"jsonrpc": "2.0",
	"id": "generated-request-id",
	"method": "tools/call",
	"params": {
		"name": "search_docs",
		"arguments": {}
	}
}
```

The model never receives direct network access. It can only request the local `call_mcp_tool` bridge, and the Worker validates the requested MCP tool name against `MCP_TOOL_ALLOWLIST` before making the outbound request.

For a production app, consider adding per-user authorization, audit logs, input schemas for each MCP tool, timeout handling, and explicit confirmation before tools perform writes.

### Modifying the System Prompt

The default agent system prompt and planner prompt can be changed by updating `SYSTEM_PROMPT` and `BASE_PLANNER_PROMPT` in `src/index.ts`.

### Styling

The UI styling is contained in the `<style>` section of `public/index.html`. You can modify the CSS variables at the top to quickly change the color scheme.

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)
# agentic-chat-template

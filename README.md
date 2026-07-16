# Agent Workspace Template

A full-featured agentic workspace template running entirely on Cloudflare's developer platform. Build AI-powered productivity tools with workspace management, real-time streaming, user authentication via Cloudflare Access, and persistent storage with D1.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cstemp/agentic-chat-template)

For a high-level summary, see the [Executive Overview](./OVERVIEW.md).

<!-- dash-content-start -->

## Overview

This template provides a complete workspace-based agent interface that runs 100% on Cloudflare infrastructure:

- **Cloudflare Workers** - Serverless compute for the API and frontend
- **Workers AI** - LLM inference for planning and responses
- **AI Gateway** - Analytics, caching, and rate limiting for AI requests
- **D1** - SQLite database for workspace and message persistence
- **Cloudflare Access** - User authentication via JWT tokens
- **Workers Assets** - Static file serving for the React frontend
- **Browser Run** - Web content extraction and rendering

## Features

- **Workspace Management**: Create, organize, and persist multiple workspaces per user
- **Real-time Streaming**: Server-Sent Events for live agent progress and responses
- **Agentic Workflow**: Plan, call tools, inspect results, generate answers
- **User Authentication**: Cloudflare Access JWT integration for user identity
- **Dark/Light Themes**: Modern UI with full theme support
- **Model Selection**: Choose between available Workers AI models
- **File Attachments**: Attach images and documents to messages
- **Skills System**: Reusable markdown workflow recipes
- **MCP Integration**: User-configurable MCP servers for external tools
- **Web Fetching**: Browser Run integration for extracting web content

<!-- dash-content-end -->

## Cloudflare Infrastructure

| Service | Purpose |
|---------|---------|
| **Workers** | API endpoints, SSE streaming, static assets |
| **Workers AI** | LLM inference (Llama, Mistral, etc.) |
| **AI Gateway** | Request logging, caching, rate limiting |
| **D1** | User data, workspaces, messages persistence |
| **Access** | Authentication, user identity via JWT |
| **Browser Run** | Web page fetching and markdown extraction |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- A Cloudflare account with Workers AI access
- Wrangler CLI: `npx wrangler login`

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/cstemp/agentic-chat-template
   cd agent-workflow-template
   npm install
   ```

2. Create the D1 database:

   ```bash
   npx wrangler d1 create agent-workspace-db
   ```

3. Copy the database ID from the output and update `wrangler.jsonc`:

   ```jsonc
   "d1_databases": [
     {
       "binding": "DB",
       "database_name": "agent-workspace-db",
       "database_id": "YOUR_DATABASE_ID"  // <-- paste here
     }
   ]
   ```

4. Initialize the database schema:

   ```bash
   npx wrangler d1 execute agent-workspace-db --file=./schema.sql
   ```

5. (Optional) Create an AI Gateway for analytics:

   - Go to [AI Gateway Dashboard](https://dash.cloudflare.com/?to=/:account/ai/ai-gateway)
   - Create a new gateway
   - Copy the Gateway ID to `wrangler.jsonc`:
     ```jsonc
     "vars": {
       "AI_GATEWAY_ID": "your-gateway-id"
     }
     ```

6. (Optional) Set up Cloudflare Access:

   - Go to [Access Dashboard](https://one.dash.cloudflare.com/)
   - Create an application for your Worker's domain
   - Configure identity providers (Google, GitHub, etc.)
   - Users will automatically be authenticated via JWT

### Development

For local development without Access:

1. Enable dev auth in `wrangler.jsonc`:
   ```jsonc
   "vars": {
     "ALLOW_DEV_AUTH": "true"
   }
   ```

2. Start the dev server:
   ```bash
   npm run dev
   ```

3. The app will use `X-Dev-User-Email` header for authentication locally.

For frontend-only development with hot reload:

```bash
# Terminal 1: Start the worker
npm run dev:worker

# Terminal 2: Start Vite dev server
npm run dev:client
```

### Deployment

```bash
npm run deploy
```

After deploying, protect your Worker URL with Cloudflare Access to require authentication.

## Project Structure

```
/
├── client/                    # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx            # Main app with routing
│   │   ├── lib/api.ts         # API client
│   │   ├── hooks/
│   │   │   ├── useWorkspaces.ts  # Workspace state management
│   │   │   └── useModels.ts      # Model fetching hook
│   │   ├── components/        # Reusable UI components
│   │   └── pages/             # Page components
├── src/
│   ├── index.ts               # Worker entry point & API routes
│   ├── auth.ts                # Cloudflare Access JWT handling
│   ├── db.ts                  # D1 database operations
│   └── types.ts               # TypeScript types
├── public/skills/             # Markdown skill recipes
├── schema.sql                 # D1 database schema
├── wrangler.jsonc             # Cloudflare Worker config
└── vite.config.ts             # Vite configuration
```

## API Endpoints

### Authentication
All API endpoints (except `/api/skills`, `/api/models`, and `/api/me`) require authentication via Cloudflare Access JWT.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/me` | GET | Get current user info |
| `/api/models` | GET | List available AI models |
| `/api/skills` | GET | List available skills |
| `/api/workspaces` | GET | List user's workspaces |
| `/api/workspaces` | POST | Create new workspace |
| `/api/workspaces/:id` | GET | Get workspace with messages |
| `/api/workspaces/:id` | PUT | Update workspace |
| `/api/workspaces/:id` | DELETE | Delete workspace |
| `/api/workspaces/:id/messages` | POST | Add message to workspace |
| `/api/mcp-servers` | GET | List user's MCP servers |
| `/api/mcp-servers` | POST | Add MCP server |
| `/api/mcp-servers/:id` | GET | Get MCP server |
| `/api/mcp-servers/:id` | PUT | Update MCP server |
| `/api/mcp-servers/:id` | DELETE | Delete MCP server |
| `/api/mcp-servers/:id/test` | POST | Test MCP server connection |
| `/api/agent` | POST | Run agent (streaming SSE) |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_ID` | No | AI Gateway ID for analytics/caching |
| `AI_GATEWAY_SKIP_CACHE` | No | Set to "true" to bypass cache |
| `AI_GATEWAY_CACHE_TTL` | No | Cache TTL in seconds (default: 3600) |
| `MCP_SERVER_URL` | No | Remote MCP server endpoint |
| `MCP_TOOL_ALLOWLIST` | No | Comma-separated allowed MCP tools |
| `ALLOW_DEV_AUTH` | No | Set to "true" for local dev auth |

### Secrets

```bash
# MCP server authentication (if needed)
npx wrangler secret put MCP_AUTH_TOKEN
```

## MCP Server Configuration

Users can configure their own MCP (Model Context Protocol) servers through the Settings page (`/settings`). Each user's servers are private and not shared with other users.

### User-Configured Servers

- Navigate to Settings > MCP Servers
- Add servers with URL, optional auth token, and tool allowlist
- Test connections to verify server availability
- Enable/disable servers without deleting them

The agent automatically includes enabled MCP servers in its planning phase and can call tools from any configured server using the `call_user_mcp_tool` function.

### Database Schema

User MCP servers are stored in the `mcp_servers` table:

```sql
CREATE TABLE mcp_servers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    auth_token TEXT,
    tool_allowlist TEXT,
    is_enabled INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Converting to Admin-Configured Servers

To make MCP servers admin-configured (shared across all users) instead of user-specific:

1. **Remove user_id filtering**: Update `getEnabledMcpServers()` in `src/db.ts` to not filter by user ID
2. **Move to environment config**: Store server configurations in `wrangler.jsonc` vars or use the existing `MCP_SERVER_URL` pattern
3. **Remove Settings UI**: Or convert it to admin-only access
4. **Add Access policies**: Use Cloudflare Access to restrict who can configure servers

For enterprise deployments, consider using [MCP Server Portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/) for centralized tool governance with access policies and audit logging.

## Customization

### Adding Models

Add new models to the `SUPPORTED_MODELS` array in `src/index.ts`:

```typescript
const SUPPORTED_MODELS = [
  {
    id: "my-model",
    workersId: "@cf/provider/model-name",
    name: "Display Name",
    provider: "Provider",
    description: "Optional description",
  },
  // ... existing models
];
```

The frontend automatically fetches available models from the `/api/models` endpoint.

### Adding Skills

1. Create a markdown file in `public/skills/`:

   ```markdown
   ---
   name: my-skill
   description: Description of what this skill does.
   tools:
     - search_runbook
     - lookup_account
   ---

   # My Skill

   Instructions for the agent...
   ```

2. Add the skill to `SKILLS` array in `src/index.ts`

### Adding Tools

1. Define the tool function in `src/index.ts`
2. Add it to the `runTool` switch statement
3. Update `BASE_PLANNER_PROMPT` with tool description
4. Add to relevant skills' `tools` frontmatter

### Database Schema

The D1 schema includes:

- `users` - User accounts (populated from Access JWT)
- `workspaces` - User workspaces
- `messages` - Chat messages
- `message_attachments` - File attachments
- `message_steps` - Agent steps (plans, tool results, etc.)
- `mcp_servers` - User-configured MCP servers

To modify, edit `schema.sql` and re-run:
```bash
npx wrangler d1 execute agent-workspace-db --file=./schema.sql
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Build frontend + start Wrangler |
| `npm run dev:client` | Start Vite dev server only |
| `npm run dev:worker` | Start Wrangler only |
| `npm run build:client` | Build React to `/dist` |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run check` | Type-check + dry-run deploy |

## Security Considerations

- All API routes require Cloudflare Access authentication (except `/api/skills`, `/api/models`, `/api/me`)
- Tool execution is server-side and allowlisted
- MCP tools are validated against `MCP_TOOL_ALLOWLIST`
- User data is isolated by user ID from Access JWT
- Dev auth (`X-Dev-User-Email`) is disabled by default

## Reference Architecture

This template implements the core patterns from Cloudflare's [Enterprise AI Agent Workspace](https://developers.cloudflare.com/reference-architecture/diagrams/ai/enterprise-ai-agent-workspace/) reference architecture. It provides a foundation you can extend toward a full enterprise deployment.

### What This Template Implements

| Component | Implementation | Status |
|-----------|----------------|--------|
| **Workers** | API endpoints, SSE streaming, static assets | Complete |
| **Access** | User authentication via JWT | Complete |
| **AI Gateway** | Model governance, caching, analytics | Complete |
| **D1** | Workspace and message persistence | Complete |
| **Browser Run** | Web content extraction via `fetch_webpage` tool | Complete |
| **Skills** | Markdown-based reusable workflows (file-based) | Working |
| **MCP integration** | User-configurable MCP servers | Complete |
| **Context library** | Shared organizational knowledge | UI only* |
| **In-app analytics** | Usage tracking dashboard | Not yet |

*The Context page (`/context`) provides the UI framework but requires backend implementation. See "Adding Shared Context" below.

### Current Limitations

This template provides a functional starting point, not a complete enterprise deployment. Key areas for extension:

1. **Skills are file-based**: Skills are static markdown files. For dynamic skill management (create/edit/delete via UI), add a `skills` table to D1 and CRUD endpoints.

2. **Context is UI-only**: The Context page shows the intended UX but has no backend. Implementing shared context requires storage (R2/D1), optional vectorization (Vectorize), and injection into agent prompts.

3. **Analytics are external**: Usage data is available in AI Gateway and Workers dashboards, but there's no in-app analytics. Add Workers Analytics Engine for custom metrics.

### Evolving Toward Enterprise

The reference architecture describes additional capabilities for production enterprise deployments. Here's how to extend this template:

#### Durable Objects for Real-time State

This template uses D1 for persistence with stateless Workers. For real-time collaboration, persistent WebSocket connections, and stronger consistency, migrate workspace state to [Durable Objects](https://developers.cloudflare.com/durable-objects/):

```
Workers (stateless) → Durable Object per workspace (stateful)
                   → Durable Object per user (profile/registry)
```

Each workspace becomes a single Durable Object that owns conversation state, coordinates tools, and survives browser disconnects.

#### Agents SDK for Orchestration

Replace the custom agentic loop with the [Agents SDK](https://developers.cloudflare.com/agents/) for production-grade orchestration:

- Built-in conversation management
- Structured tool calling
- Better streaming patterns
- Human-in-the-loop support

#### Code Execution Environments

For workspaces that generate and run code:

| Use Case | Cloudflare Primitive |
|----------|---------------------|
| Bounded code snippets | [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/) |
| Full dev environment | [Sandbox SDK](https://developers.cloudflare.com/sandbox/) |
| Browser automation | [Browser Run](https://developers.cloudflare.com/browser-run/) |

#### Shared Context Library

The reference architecture emphasizes a curated, read-only library of organizational context that agents can draw from. To implement:

1. **Storage**: Use [R2](https://developers.cloudflare.com/r2/) for documents and reference materials
2. **Search**: Add [Vectorize](https://developers.cloudflare.com/vectorize/) for semantic retrieval
3. **Injection**: Load relevant context into agent prompts based on the conversation

```sql
-- Example schema extension for context sources
CREATE TABLE context_sources (
    id TEXT PRIMARY KEY,
    user_id TEXT,           -- null for org-wide context
    workspace_id TEXT,      -- null for user-wide context
    type TEXT NOT NULL,     -- 'document', 'url', 'database'
    name TEXT NOT NULL,
    content TEXT,           -- inline content or R2 path
    vector_status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (unixepoch())
);
```

The Context page UI (`/context`) is ready for this—it just needs the API endpoints and storage backend.

#### File Storage with R2

For large files, versioned outputs, and shared context libraries, add [R2](https://developers.cloudflare.com/r2/):

- Store file attachments (currently inline in D1)
- Version workspace outputs
- Host shared skills/context library
- Backup sandbox environments

#### MCP Server Portals

For enterprise tool governance, use [MCP Server Portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/) instead of direct MCP connections:

- Centralized tool curation per team
- Access policies and credential routing
- Audit logging for tool calls

#### Analytics and Observability

Add [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) for:

- Usage tracking per user/workspace
- Model cost attribution
- Tool call analytics
- Lifecycle events

### Architecture Comparison

| Aspect | This Template | Full Enterprise |
|--------|---------------|-----------------|
| State management | D1 (stateless Workers) | Durable Objects (stateful) |
| Agent orchestration | Custom agentic loop | Agents SDK |
| Skills | File-based markdown | R2 + versioned publishing |
| Context library | UI placeholder | R2 + Vectorize |
| File storage | Inline in D1 | R2 with versioning |
| Code execution | Browser Run only | Dynamic Workers, Sandbox |
| Tool governance | User MCP allowlists | MCP Server Portals |
| Analytics | AI Gateway (external) | Workers Analytics Engine |

## Resources

- [Enterprise AI Agent Workspace Reference Architecture](https://developers.cloudflare.com/reference-architecture/diagrams/ai/enterprise-ai-agent-workspace/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/)
- [Agents SDK](https://developers.cloudflare.com/agents/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [R2 Storage](https://developers.cloudflare.com/r2/)
- [Vectorize](https://developers.cloudflare.com/vectorize/)
- [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)
- [MCP Server Portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)

# Agent Workspace Template

A full-featured agentic workspace template running entirely on Cloudflare's developer platform. Build AI-powered productivity tools with workspace management, real-time streaming, user authentication via Cloudflare Access, and persistent storage with D1.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cstemp/agentic-chat-template)

<!-- dash-content-start -->

## Overview

This template provides a complete workspace-based agent interface that runs 100% on Cloudflare infrastructure:

- **Cloudflare Workers** - Serverless compute for the API and frontend
- **Workers AI** - LLM inference for planning and responses
- **AI Gateway** - Analytics, caching, and rate limiting for AI requests
- **D1** - SQLite database for workspace and message persistence
- **Cloudflare Access** - User authentication via JWT tokens
- **Workers Assets** - Static file serving for the React frontend

## Features

- **Workspace Management**: Create, organize, and persist multiple workspaces per user
- **Real-time Streaming**: Server-Sent Events for live agent progress and responses
- **Agentic Workflow**: Plan, call tools, inspect results, generate answers
- **User Authentication**: Cloudflare Access JWT integration for user identity
- **Dark/Light Themes**: Modern UI with full theme support
- **Model Selection**: Choose between available Workers AI models
- **File Attachments**: Attach images and documents to messages
- **Skills System**: Reusable markdown workflow recipes
- **MCP Integration**: Optional remote Model Context Protocol tool bridge

<!-- dash-content-end -->

## Cloudflare Infrastructure

| Service | Purpose |
|---------|---------|
| **Workers** | API endpoints, SSE streaming, static assets |
| **Workers AI** | LLM inference (Llama, Mistral, etc.) |
| **AI Gateway** | Request logging, caching, rate limiting |
| **D1** | User data, workspaces, messages persistence |
| **Access** | Authentication, user identity via JWT |

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

## Resources

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/)

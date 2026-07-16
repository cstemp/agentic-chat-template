/**
 * Agent Workflow Template
 *
 * A minimal Cloudflare Workers AI agent that plans, calls allowlisted tools,
 * and streams the final response back to the browser with Server-Sent Events.
 *
 * @license MIT
 */
import { ChatMessage, Env } from "./types";
import { getUser, AccessUser } from "./auth";
import * as db from "./db";
import type { McpServerResponse } from "./db";

// User MCP server with auth token for runtime use
interface UserMcpServer extends McpServerResponse {
	authToken?: string;
}

// Default model ID for Workers AI.
// https://developers.cloudflare.com/workers-ai/models/
const DEFAULT_MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Supported models that can be selected from the frontend.
// Maps frontend ID -> Workers AI model ID
// See: https://developers.cloudflare.com/workers-ai/models/
const SUPPORTED_MODELS: {
	id: string;
	workersId: string;
	name: string;
	provider: string;
	description?: string;
}[] = [
	// Meta Llama models
	{
		id: "llama-3.3-70b-instruct-fp8-fast",
		workersId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		name: "Llama 3.3 70B Instruct",
		provider: "Meta",
		description: "Latest Llama, fast inference",
	},
	{
		id: "llama-3.1-8b-instruct",
		workersId: "@cf/meta/llama-3.1-8b-instruct-fp8",
		name: "Llama 3.1 8B Instruct",
		provider: "Meta",
		description: "Fast and efficient",
	},
	{
		id: "llama-3.1-70b-instruct",
		workersId: "@cf/meta/llama-3.1-70b-instruct",
		name: "Llama 3.1 70B Instruct",
		provider: "Meta",
		description: "High capability",
	},
	{
		id: "llama-3-8b-instruct",
		workersId: "@cf/meta/llama-3-8b-instruct",
		name: "Llama 3 8B Instruct",
		provider: "Meta",
	},
	{
		id: "llama-2-7b-chat-fp16",
		workersId: "@cf/meta/llama-2-7b-chat-fp16",
		name: "Llama 2 7B Chat",
		provider: "Meta",
	},
	// Mistral models
	{
		id: "mistral-7b-instruct-v0.2",
		workersId: "@cf/mistral/mistral-7b-instruct-v0.2",
		name: "Mistral 7B Instruct v0.2",
		provider: "Mistral AI",
		description: "Latest Mistral 7B",
	},
	{
		id: "mistral-7b-instruct",
		workersId: "@cf/mistral/mistral-7b-instruct-v0.1",
		name: "Mistral 7B Instruct v0.1",
		provider: "Mistral AI",
	},
	// Qwen models
	{
		id: "qwen1.5-14b-chat-awq",
		workersId: "@cf/qwen/qwen1.5-14b-chat-awq",
		name: "Qwen 1.5 14B Chat",
		provider: "Alibaba",
		description: "Strong multilingual",
	},
	{
		id: "qwen1.5-7b-chat-awq",
		workersId: "@cf/qwen/qwen1.5-7b-chat-awq",
		name: "Qwen 1.5 7B Chat",
		provider: "Alibaba",
	},
	{
		id: "qwen1.5-1.8b-chat",
		workersId: "@cf/qwen/qwen1.5-1.8b-chat",
		name: "Qwen 1.5 1.8B Chat",
		provider: "Alibaba",
		description: "Ultra fast",
	},
	// Google Gemma models
	{
		id: "gemma-7b-it",
		workersId: "@hf/google/gemma-7b-it",
		name: "Gemma 7B Instruct",
		provider: "Google",
	},
	{
		id: "gemma-2b-it",
		workersId: "@cf/google/gemma-2b-it-lora",
		name: "Gemma 2B Instruct",
		provider: "Google",
		description: "Lightweight",
	},
	// Microsoft Phi models
	{
		id: "phi-2",
		workersId: "@cf/microsoft/phi-2",
		name: "Phi-2",
		provider: "Microsoft",
		description: "Small but capable",
	},
	// DeepSeek models
	{
		id: "deepseek-coder-6.7b-instruct",
		workersId: "@hf/thebloke/deepseek-coder-6.7b-instruct-awq",
		name: "DeepSeek Coder 6.7B",
		provider: "DeepSeek",
		description: "Code specialized",
	},
	// Openchat
	{
		id: "openchat-3.5",
		workersId: "@cf/openchat/openchat-3.5-0106",
		name: "OpenChat 3.5",
		provider: "OpenChat",
	},
	// Hermes
	{
		id: "hermes-2-pro-mistral-7b",
		workersId: "@hf/nousresearch/hermes-2-pro-mistral-7b",
		name: "Hermes 2 Pro Mistral 7B",
		provider: "Nous Research",
		description: "Function calling",
	},
	// TinyLlama
	{
		id: "tinyllama-1.1b-chat",
		workersId: "@cf/tinyllama/tinyllama-1.1b-chat-v1.0",
		name: "TinyLlama 1.1B Chat",
		provider: "TinyLlama",
		description: "Ultra lightweight",
	},
	// SQL specialized
	{
		id: "sqlcoder-7b",
		workersId: "@cf/defog/sqlcoder-7b-2",
		name: "SQLCoder 7B",
		provider: "Defog",
		description: "SQL generation",
	},
];

// Create a lookup map for quick model resolution
const MODEL_LOOKUP = new Map(SUPPORTED_MODELS.map((m) => [m.id, m.workersId]));

/**
 * Get AI Gateway options if configured.
 */
function getGatewayOptions(env: Env): { gateway?: { id: string; skipCache?: boolean; cacheTtl?: number } } {
	if (!env.AI_GATEWAY_ID) {
		return {};
	}

	return {
		gateway: {
			id: env.AI_GATEWAY_ID,
			skipCache: env.AI_GATEWAY_SKIP_CACHE === "true",
			cacheTtl: env.AI_GATEWAY_CACHE_TTL ? parseInt(env.AI_GATEWAY_CACHE_TTL, 10) : 3600,
		},
	};
}

const MAX_TOOL_CALLS = 2;

const SKILLS = [
	{
		name: "triage",
		description:
			"Triage an operational issue, inspect context, and recommend next steps.",
		path: "/skills/triage.md",
	},
	{
		name: "customer-research",
		description: "Gather customer context and turn it into a short briefing.",
		path: "/skills/customer-research.md",
	},
] as const;

const SYSTEM_PROMPT = `You are a helpful AI assistant. Answer questions directly and helpfully using your knowledge. Be concise but thorough.`;

const BASE_PLANNER_PROMPT = `You are a planning module that decides whether to use tools or answer directly.

Available tools:
- fetch_webpage: Fetch and extract content from a URL as markdown. Use for reading web pages, articles, documentation. Arguments: { "url": string }
- search_runbook: Search internal operational procedures (demo data). Arguments: { "query": string }
- lookup_account: Look up customer account info by ID (demo data). Arguments: { "accountId": string }
- create_follow_up_task: Create a follow-up task (demo). Arguments: { "title": string, "priority": "low" | "medium" | "high" }

Guidelines:
- Use fetch_webpage when the user asks about content from a specific URL or website
- Use demo tools (search_runbook, lookup_account, create_follow_up_task) only for their specific purposes
- Answer general knowledge questions directly WITHOUT tools

Return JSON only:
{
  "thought": "reason",
  "tool_calls": []
}

Examples:
- "What does example.com say?" -> use fetch_webpage with url "https://example.com"
- "Summarize this article: https://..." -> use fetch_webpage
- "What is Cloudflare Workers?" -> empty (general knowledge, no URL given)
- "Look up account ABC123" -> use lookup_account
- "What's our incident triage process?" -> use search_runbook

Use at most ${MAX_TOOL_CALLS} tool calls.`;

type ToolName =
	| "fetch_webpage"
	| "search_runbook"
	| "lookup_account"
	| "create_follow_up_task"
	| "call_mcp_tool"
	| "call_user_mcp_tool";

interface ToolCall {
	name: ToolName;
	arguments: Record<string, unknown>;
}

interface AgentPlan {
	thought: string;
	tool_calls: ToolCall[];
}

interface ToolResult {
	name: ToolName;
	arguments: Record<string, unknown>;
	result: string;
}

interface Skill {
	name: string;
	description: string;
	content: string;
	allowedTools: string[];
}

type AgentEvent =
	| { type: "status"; message: string }
	| { type: "plan"; thought: string; toolCalls: ToolCall[] }
	| { type: "tool_result"; name: ToolName; result: string }
	| { type: "answer_delta"; content: string }
	| { type: "done" }
	| { type: "error"; message: string };

export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			// Try to serve the exact asset first
			const assetResponse = await env.ASSETS.fetch(request);
			
			// If asset not found (404), serve index.html for SPA client-side routing
			if (assetResponse.status === 404) {
				const indexRequest = new Request(new URL("/index.html", request.url), request);
				return env.ASSETS.fetch(indexRequest);
			}
			
			return assetResponse;
		}

		// CORS headers for API routes
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion, X-Dev-User-Email",
		};

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		// Get user from Access JWT (or dev header for local testing)
		const allowDevAuth = env.ALLOW_DEV_AUTH === "true";
		const user = getUser(request, allowDevAuth);

		// API Routes that don't require auth
		if (url.pathname === "/api/models") {
			if (request.method === "GET") {
				// Return available models for the frontend
				const models = SUPPORTED_MODELS.map(({ id, name, provider, description }) => ({
					id,
					name,
					provider,
					description,
				}));
				return Response.json({ models }, { headers: corsHeaders });
			}
			return new Response("Method not allowed", { status: 405, headers: corsHeaders });
		}

		if (url.pathname === "/api/skills") {
			if (request.method === "GET") {
				// Load skills with their tools from markdown frontmatter
				const skillsWithTools = await Promise.all(
					SKILLS.map(async (skill) => {
						try {
							const skillUrl = new URL(skill.path, "https://skills.local");
							const response = await env.ASSETS.fetch(new Request(skillUrl));
							if (!response.ok) {
								return { ...skill, tools: [] };
							}
							const markdown = await response.text();
							const frontmatter = parseFrontmatter(markdown);
							return {
								...skill,
								tools: parseFrontmatterList(frontmatter.tools),
							};
						} catch {
							return { ...skill, tools: [] };
						}
					})
				);
				return Response.json({ skills: skillsWithTools }, { headers: corsHeaders });
			}

			return new Response("Method not allowed", { status: 405, headers: corsHeaders });
		}

		// API route to get current user info
		if (url.pathname === "/api/me") {
			if (!user) {
				return Response.json(
					{ authenticated: false },
					{ headers: corsHeaders }
				);
			}
			return Response.json(
				{
					authenticated: true,
					id: user.id,
					email: user.email,
					name: user.name,
				},
				{ headers: corsHeaders }
			);
		}

		// All other API routes require authentication
		if (!user) {
			return Response.json(
				{ error: "Unauthorized. Please authenticate via Cloudflare Access." },
				{ status: 401, headers: corsHeaders }
			);
		}

		// Ensure user exists in database
		await db.ensureUser(env.DB, user);

		// Workspace API routes
		if (url.pathname === "/api/workspaces") {
			return handleWorkspacesRoute(request, env, user, corsHeaders);
		}

		// Single workspace routes: /api/workspaces/:id
		const workspaceMatch = url.pathname.match(/^\/api\/workspaces\/([^\/]+)$/);
		if (workspaceMatch) {
			return handleWorkspaceRoute(request, env, user, workspaceMatch[1], corsHeaders);
		}

		// Workspace messages: /api/workspaces/:id/messages
		const messagesMatch = url.pathname.match(/^\/api\/workspaces\/([^\/]+)\/messages$/);
		if (messagesMatch) {
			return handleMessagesRoute(request, env, user, messagesMatch[1], corsHeaders);
		}

		// Single message: /api/workspaces/:id/messages/:messageId
		const messageMatch = url.pathname.match(/^\/api\/workspaces\/([^\/]+)\/messages\/([^\/]+)$/);
		if (messageMatch) {
			return handleMessageRoute(request, env, user, messageMatch[1], messageMatch[2], corsHeaders);
		}

		// MCP servers routes: /api/mcp-servers
		if (url.pathname === "/api/mcp-servers") {
			return handleMcpServersRoute(request, env, user, corsHeaders);
		}

		// Single MCP server: /api/mcp-servers/:id
		const mcpServerMatch = url.pathname.match(/^\/api\/mcp-servers\/([^\/]+)$/);
		if (mcpServerMatch) {
			return handleMcpServerRoute(request, env, user, mcpServerMatch[1], corsHeaders);
		}

		// Test MCP server connection: /api/mcp-servers/:id/test
		const mcpTestMatch = url.pathname.match(/^\/api\/mcp-servers\/([^\/]+)\/test$/);
		if (mcpTestMatch) {
			return handleMcpServerTestRoute(request, env, user, mcpTestMatch[1], corsHeaders);
		}

		if (url.pathname === "/api/agent") {
			// Handle POST requests for agent runs.
			if (request.method === "POST") {
				return handleAgentRequest(request, env, user, corsHeaders);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405, headers: corsHeaders });
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404, headers: corsHeaders });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handle /api/workspaces routes
 */
async function handleWorkspacesRoute(
	request: Request,
	env: Env,
	user: AccessUser,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (request.method === "GET") {
		const workspaces = await db.getWorkspaces(env.DB, user.id);
		return Response.json({ workspaces }, { headers: corsHeaders });
	}

	if (request.method === "POST") {
		try {
			const body = await request.json() as { title?: string; color?: string };
			const workspace = await db.createWorkspace(env.DB, user.id, body);
			return Response.json({ workspace }, { status: 201, headers: corsHeaders });
		} catch (error) {
			return Response.json(
				{ error: "Failed to create workspace" },
				{ status: 400, headers: corsHeaders }
			);
		}
	}

	return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

/**
 * Handle /api/workspaces/:id routes
 */
async function handleWorkspaceRoute(
	request: Request,
	env: Env,
	user: AccessUser,
	workspaceId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (request.method === "GET") {
		const workspace = await db.getWorkspace(env.DB, user.id, workspaceId);
		if (!workspace) {
			return Response.json(
				{ error: "Workspace not found" },
				{ status: 404, headers: corsHeaders }
			);
		}
		return Response.json({ workspace }, { headers: corsHeaders });
	}

	if (request.method === "PUT" || request.method === "PATCH") {
		try {
			const body = await request.json() as Partial<{
				title: string;
				color: string;
				selectedModel: string;
				selectedSkill: string;
				isFavorite: boolean;
			}>;
			const success = await db.updateWorkspace(env.DB, user.id, workspaceId, body);
			if (!success) {
				return Response.json(
					{ error: "Workspace not found" },
					{ status: 404, headers: corsHeaders }
				);
			}
			return Response.json({ success: true }, { headers: corsHeaders });
		} catch (error) {
			return Response.json(
				{ error: "Failed to update workspace" },
				{ status: 400, headers: corsHeaders }
			);
		}
	}

	if (request.method === "DELETE") {
		const success = await db.deleteWorkspace(env.DB, user.id, workspaceId);
		if (!success) {
			return Response.json(
				{ error: "Workspace not found" },
				{ status: 404, headers: corsHeaders }
			);
		}
		return Response.json({ success: true }, { headers: corsHeaders });
	}

	return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

/**
 * Handle /api/workspaces/:id/messages routes
 */
async function handleMessagesRoute(
	request: Request,
	env: Env,
	user: AccessUser,
	workspaceId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (request.method === "POST") {
		try {
			const body = await request.json() as {
				role: "user" | "assistant";
				content: string;
				attachments?: {
					id: string;
					name: string;
					type: "image" | "document" | "other";
					size: number;
					preview?: string;
				}[];
				steps?: {
					type: "status" | "plan" | "tool_result" | "error";
					content: string;
					data?: unknown;
				}[];
			};
			const message = await db.addMessage(env.DB, user.id, workspaceId, body);
			return Response.json({ message }, { status: 201, headers: corsHeaders });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to add message";
			return Response.json(
				{ error: message },
				{ status: 400, headers: corsHeaders }
			);
		}
	}

	return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

/**
 * Handle /api/workspaces/:id/messages/:messageId routes
 */
async function handleMessageRoute(
	request: Request,
	env: Env,
	user: AccessUser,
	workspaceId: string,
	messageId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (request.method === "PUT" || request.method === "PATCH") {
		try {
			const body = await request.json() as {
				content?: string;
				steps?: {
					type: "status" | "plan" | "tool_result" | "error";
					content: string;
					data?: unknown;
				}[];
			};
			const success = await db.updateMessage(env.DB, user.id, workspaceId, messageId, body);
			if (!success) {
				return Response.json(
					{ error: "Message not found" },
					{ status: 404, headers: corsHeaders }
				);
			}
			return Response.json({ success: true }, { headers: corsHeaders });
		} catch (error) {
			return Response.json(
				{ error: "Failed to update message" },
				{ status: 400, headers: corsHeaders }
			);
		}
	}

	return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

/**
 * Handle /api/mcp-servers routes
 */
async function handleMcpServersRoute(
	request: Request,
	env: Env,
	user: AccessUser,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (request.method === "GET") {
		const servers = await db.getMcpServers(env.DB, user.id);
		return Response.json({ servers }, { headers: corsHeaders });
	}

	if (request.method === "POST") {
		try {
			const body = await request.json() as {
				name: string;
				url: string;
				authToken?: string;
				toolAllowlist?: string[];
			};

			if (!body.name || !body.url) {
				return Response.json(
					{ error: "Name and URL are required" },
					{ status: 400, headers: corsHeaders }
				);
			}

			// Validate URL
			try {
				new URL(body.url);
			} catch {
				return Response.json(
					{ error: "Invalid URL format" },
					{ status: 400, headers: corsHeaders }
				);
			}

			const server = await db.createMcpServer(env.DB, user.id, body);
			return Response.json({ server }, { status: 201, headers: corsHeaders });
		} catch (error) {
			return Response.json(
				{ error: "Failed to create MCP server" },
				{ status: 400, headers: corsHeaders }
			);
		}
	}

	return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

/**
 * Handle /api/mcp-servers/:id routes
 */
async function handleMcpServerRoute(
	request: Request,
	env: Env,
	user: AccessUser,
	serverId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (request.method === "GET") {
		const server = await db.getMcpServer(env.DB, user.id, serverId);
		if (!server) {
			return Response.json(
				{ error: "MCP server not found" },
				{ status: 404, headers: corsHeaders }
			);
		}
		return Response.json({ server }, { headers: corsHeaders });
	}

	if (request.method === "PUT" || request.method === "PATCH") {
		try {
			const body = await request.json() as Partial<{
				name: string;
				url: string;
				authToken: string;
				toolAllowlist: string[];
				isEnabled: boolean;
			}>;

			// Validate URL if provided
			if (body.url) {
				try {
					new URL(body.url);
				} catch {
					return Response.json(
						{ error: "Invalid URL format" },
						{ status: 400, headers: corsHeaders }
					);
				}
			}

			const success = await db.updateMcpServer(env.DB, user.id, serverId, body);
			if (!success) {
				return Response.json(
					{ error: "MCP server not found" },
					{ status: 404, headers: corsHeaders }
				);
			}
			return Response.json({ success: true }, { headers: corsHeaders });
		} catch (error) {
			return Response.json(
				{ error: "Failed to update MCP server" },
				{ status: 400, headers: corsHeaders }
			);
		}
	}

	if (request.method === "DELETE") {
		const success = await db.deleteMcpServer(env.DB, user.id, serverId);
		if (!success) {
			return Response.json(
				{ error: "MCP server not found" },
				{ status: 404, headers: corsHeaders }
			);
		}
		return Response.json({ success: true }, { headers: corsHeaders });
	}

	return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

/**
 * Handle /api/mcp-servers/:id/test routes
 */
async function handleMcpServerTestRoute(
	request: Request,
	env: Env,
	user: AccessUser,
	serverId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405, headers: corsHeaders });
	}

	const server = await db.getMcpServerWithToken(env.DB, user.id, serverId);
	if (!server) {
		return Response.json(
			{ error: "MCP server not found" },
			{ status: 404, headers: corsHeaders }
		);
	}

	try {
		// Try to list tools from the MCP server
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (server.authToken) {
			headers["Authorization"] = `Bearer ${server.authToken}`;
		}

		const response = await fetch(server.url, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
			}),
		});

		if (!response.ok) {
			return Response.json(
				{
					success: false,
					error: `Server returned ${response.status}: ${response.statusText}`,
				},
				{ headers: corsHeaders }
			);
		}

		const result = await response.json() as {
			result?: { tools?: { name: string; description?: string }[] };
			error?: { message: string };
		};

		if (result.error) {
			return Response.json(
				{ success: false, error: result.error.message },
				{ headers: corsHeaders }
			);
		}

		const tools = result.result?.tools || [];
		return Response.json(
			{
				success: true,
				tools: tools.map((t) => ({ name: t.name, description: t.description })),
			},
			{ headers: corsHeaders }
		);
	} catch (error) {
		return Response.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Failed to connect to MCP server",
			},
			{ headers: corsHeaders }
		);
	}
}

/**
 * Handles agent workflow requests.
 */
async function handleAgentRequest(
	request: Request,
	env: Env,
	user: AccessUser,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	let messages: ChatMessage[];
	let selectedSkillName: string | undefined;
	let selectedModelId: string;

	try {
		const body = (await request.json()) as {
			messages: ChatMessage[];
			skill?: string;
			model?: string;
		};
		messages = Array.isArray(body.messages) ? body.messages : [];
		selectedSkillName = typeof body.skill === "string" ? body.skill : undefined;
		
		// Map frontend model ID to Workers AI model ID
		const requestedModel = typeof body.model === "string" ? body.model : "";
		selectedModelId = MODEL_LOOKUP.get(requestedModel) || DEFAULT_MODEL_ID;
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON request body" }), {
			status: 400,
			headers: { ...corsHeaders, "content-type": "application/json" },
		});
	}

	// Capture modelId and userId for use in the stream closure
	const modelId = selectedModelId;
	const userId = user.id;

	const stream = new ReadableStream({
		async start(controller) {
			try {
				// Load user's enabled MCP servers
				const userMcpServers = await db.getEnabledMcpServers(env.DB, userId);
				
				const skill = await loadSkill(selectedSkillName, env);
				if (skill) {
					sendAgentEvent(controller, {
						type: "status",
						message: `Loaded skill: ${skill.name}`,
					});
				}

				const plan = await createPlan(messages, env, skill, modelId, userMcpServers);
				const hasToolCalls = plan.tool_calls.length > 0;

				// Only show planning UI if we're actually using tools
				if (hasToolCalls) {
					sendAgentEvent(controller, {
						type: "plan",
						thought: plan.thought,
						toolCalls: plan.tool_calls,
					});
				}

				const toolResults: ToolResult[] = [];
				for (const toolCall of plan.tool_calls.slice(0, MAX_TOOL_CALLS)) {
					sendAgentEvent(controller, {
						type: "status",
						message: `Running ${toolCall.name}`,
					});

					const result = await runTool(toolCall, env, userMcpServers);
					toolResults.push({
						name: toolCall.name,
						arguments: toolCall.arguments,
						result,
					});
					sendAgentEvent(controller, {
						type: "tool_result",
						name: toolCall.name,
						result,
					});
				}
				try {
					await streamFinalAnswer(messages, plan, toolResults, env, controller, skill, modelId);
				} catch (error) {
					console.error("Error streaming Workers AI final answer:", error);
					sendAgentEvent(controller, {
						type: "status",
						message: "Workers AI final answer unavailable; using local fallback",
					});
					sendAgentEvent(controller, {
						type: "answer_delta",
						content: createFallbackAnswer(plan, toolResults),
					});
				}
				sendAgentEvent(controller, { type: "done" });
			} catch (error) {
				console.error("Error processing agent request:", error);
				sendAgentEvent(controller, {
					type: "error",
					message: "Failed to process agent workflow",
				});
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			connection: "keep-alive",
		},
	});
}

async function createPlan(
	messages: ChatMessage[],
	env: Env,
	skill?: Skill,
	modelId: string = DEFAULT_MODEL_ID,
	userMcpServers: UserMcpServer[] = [],
): Promise<AgentPlan> {
	const plannerMessages: ChatMessage[] = [
		{ role: "system", content: buildPlannerPrompt(env, skill, userMcpServers) },
		...messages.filter((message) => message.role !== "system"),
	];

	try {
		const result = await env.AI.run(
			modelId as Parameters<typeof env.AI.run>[0],
			{
				messages: plannerMessages,
				max_tokens: 512,
			},
			getGatewayOptions(env),
		);

		const text = extractTextGenerationResponse(result);
		return parsePlan(text, messages, skill);
	} catch (error) {
		console.error("Error running Workers AI planner:", error);
		return createFallbackPlan(
			messages,
			skill,
			"Workers AI planner is unavailable, so the agent will use the runbook search fallback.",
		);
	}
}

async function streamFinalAnswer(
	messages: ChatMessage[],
	plan: AgentPlan,
	toolResults: ToolResult[],
	env: Env,
	controller: ReadableStreamDefaultController,
	skill?: Skill,
	modelId: string = DEFAULT_MODEL_ID,
): Promise<void> {
	const hasToolResults = toolResults.length > 0;
	const toolContext = hasToolResults
		? `\n\nContext from tools:\n${JSON.stringify(toolResults, null, 2)}`
		: "";

	const answerInstruction = hasToolResults
		? "Answer the user's question. If the tool results are relevant, use them. If the tool results are NOT relevant to the question, IGNORE them completely and answer using your own knowledge. Do NOT mention that tools were unhelpful or that results weren't relevant - just answer the question directly."
		: "Answer the user's question directly using your knowledge.";

	const finalMessages: ChatMessage[] = [
		{
			role: "system",
			content: skill
				? `${SYSTEM_PROMPT}\n\nSelected skill:\n${formatSkillForPrompt(skill)}`
				: SYSTEM_PROMPT,
		},
		...messages.filter((message) => message.role !== "system"),
		{
			role: "user",
			content: `${toolContext}\n\n${answerInstruction}`,
		},
	];

	const aiStream = (await env.AI.run(
		modelId as Parameters<typeof env.AI.run>[0],
		{
			messages: finalMessages,
			max_tokens: 1024,
			stream: true,
		} satisfies AiTextGenerationInput & { stream: true },
		getGatewayOptions(env),
	)) as unknown as ReadableStream;

	await forwardWorkersAiStream(aiStream, controller);
}

async function forwardWorkersAiStream(
	aiStream: ReadableStream,
	controller: ReadableStreamDefaultController,
): Promise<void> {
	const reader = aiStream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const parsed = consumeSseEvents(buffer);
		buffer = parsed.buffer;

		for (const data of parsed.events) {
			if (data === "[DONE]") return;

			try {
				const jsonData = JSON.parse(data) as {
					response?: string;
					choices?: { delta?: { content?: string } }[];
				};
				const content =
					jsonData.response ?? jsonData.choices?.[0]?.delta?.content ?? "";
				if (content) {
					sendAgentEvent(controller, { type: "answer_delta", content });
				}
			} catch (error) {
				console.error("Error parsing Workers AI stream event:", error, data);
			}
		}
	}

	const parsed = consumeSseEvents(buffer + "\n\n");
	for (const data of parsed.events) {
		if (data === "[DONE]") return;
		try {
			const jsonData = JSON.parse(data) as { response?: string };
			if (jsonData.response) {
				sendAgentEvent(controller, {
					type: "answer_delta",
					content: jsonData.response,
				});
			}
		} catch (error) {
			console.error("Error parsing final Workers AI stream event:", error, data);
		}
	}
}

async function runTool(toolCall: ToolCall, env: Env, userMcpServers: UserMcpServer[] = []): Promise<string> {
	switch (toolCall.name) {
		case "fetch_webpage":
			return fetchWebpage(env, String(toolCall.arguments.url ?? ""));
		case "search_runbook":
			return searchRunbook(String(toolCall.arguments.query ?? ""));
		case "lookup_account":
			return lookupAccount(String(toolCall.arguments.accountId ?? "demo-account"));
		case "create_follow_up_task":
			return createFollowUpTask(
				String(toolCall.arguments.title ?? "Review agent workflow"),
				String(toolCall.arguments.priority ?? "medium"),
			);
		case "call_mcp_tool":
			return callMcpTool(
				env,
				String(toolCall.arguments.toolName ?? ""),
				isRecord(toolCall.arguments.arguments)
					? toolCall.arguments.arguments
					: {},
			);
		case "call_user_mcp_tool":
			return callUserMcpTool(
				userMcpServers,
				String(toolCall.arguments.serverId ?? ""),
				String(toolCall.arguments.toolName ?? ""),
				isRecord(toolCall.arguments.arguments)
					? toolCall.arguments.arguments
					: {},
			);
	}
}

function buildPlannerPrompt(env: Env, skill?: Skill, userMcpServers: UserMcpServer[] = []): string {
	const envMcpTools = getAllowedMcpTools(env);
	const skillPrompt = skill
		? `\n\nSelected skill:\n${formatSkillForPrompt(skill)}\n\nPrefer the selected skill's workflow and output style when planning.`
		: "";

	// Build user MCP servers prompt
	let userMcpPrompt = "";
	if (userMcpServers.length > 0) {
		const serverDescriptions = userMcpServers.map((server) => {
			const tools = server.toolAllowlist.length > 0
				? `Allowed tools: ${server.toolAllowlist.join(", ")}`
				: "All tools allowed";
			return `- ${server.name} (ID: ${server.id}): ${tools}`;
		}).join("\n");
		
		userMcpPrompt = `

User-configured MCP servers:
${serverDescriptions}

- call_user_mcp_tool: Call a tool from a user-configured MCP server. Arguments: { "serverId": string, "toolName": string, "arguments": object }

Use call_user_mcp_tool when the user's question relates to one of these servers.`;
	}

	// Build env MCP prompt (legacy support)
	let envMcpPrompt = "";
	if (envMcpTools.length > 0 && env.MCP_SERVER_URL) {
		envMcpPrompt = `

Environment MCP bridge:
- call_mcp_tool: Call one allowlisted remote MCP tool. Arguments: { "toolName": string, "arguments": object }

Allowed MCP tool names: ${envMcpTools.join(", ")}

Only use call_mcp_tool when one of the allowed MCP tools is directly relevant.`;
	}

	return `${BASE_PLANNER_PROMPT}${envMcpPrompt}${userMcpPrompt}${skillPrompt}`;
}

async function loadSkill(
	selectedSkillName: string | undefined,
	env: Env,
): Promise<Skill | undefined> {
	if (!selectedSkillName) return undefined;

	const skillEntry = SKILLS.find((skill) => skill.name === selectedSkillName);
	if (!skillEntry) return undefined;

	const skillUrl = new URL(skillEntry.path, "https://skills.local");
	const response = await env.ASSETS.fetch(new Request(skillUrl));
	if (!response.ok) {
		throw new Error(`Failed to load skill '${selectedSkillName}'`);
	}

	const markdown = await response.text();
	const frontmatter = parseFrontmatter(markdown);

	return {
		name: skillEntry.name,
		description: skillEntry.description,
		content: stripFrontmatter(markdown),
		allowedTools: parseFrontmatterList(frontmatter.tools),
	};
}

function formatSkillForPrompt(skill: Skill): string {
	return [
		`Name: ${skill.name}`,
		`Description: ${skill.description}`,
		`Suggested tools: ${skill.allowedTools.join(", ") || "none"}`,
		skill.content,
	].join("\n");
}

async function fetchWebpage(env: Env, url: string): Promise<string> {
	if (!url) {
		return "Error: No URL provided";
	}

	// Validate URL
	try {
		new URL(url);
	} catch {
		return `Error: Invalid URL "${url}"`;
	}

	// Check if Browser Run is available
	if (!env.BROWSER) {
		// Fallback to simple fetch if Browser Run not configured
		try {
			const response = await fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; AgentWorkspace/1.0)",
				},
			});
			if (!response.ok) {
				return `Error: Failed to fetch ${url} (${response.status})`;
			}
			const text = await response.text();
			// Basic HTML to text conversion
			const stripped = text
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			return stripped.slice(0, 8000) + (stripped.length > 8000 ? "..." : "");
		} catch (error) {
			return `Error fetching ${url}: ${error instanceof Error ? error.message : "Unknown error"}`;
		}
	}

	// Use Browser Run to fetch and convert to markdown
	try {
		const result = await env.BROWSER.quickAction("markdown", {
			url,
			gotoOptions: {
				waitUntil: "networkidle2",
			},
		});
		
		const markdown = await result.text();
		// Parse the response - it returns JSON with success and result fields
		try {
			const parsed = JSON.parse(markdown);
			if (parsed.success && parsed.result) {
				const content = parsed.result;
				return content.slice(0, 10000) + (content.length > 10000 ? "\n\n[Content truncated...]" : "");
			}
			return parsed.result || markdown;
		} catch {
			// If not JSON, return as-is
			return markdown.slice(0, 10000);
		}
	} catch (error) {
		return `Error fetching ${url} with Browser Run: ${error instanceof Error ? error.message : "Unknown error"}`;
	}
}

function searchRunbook(query: string): string {
	const runbook = [
		"Incident triage: confirm customer impact, inspect recent deploys, check alerts, identify owner, and post a concise status update.",
		"Customer onboarding: verify plan, enable required products, create sample API tokens, and share links to product docs.",
		"AI Gateway rollout: create a gateway, route model traffic through it, enable logs, set caching policy, and review analytics.",
		"Workers deployment: run type checks, deploy with Wrangler, tail logs, and roll back if error rates increase.",
		"Support handoff: summarize the request, include account context, list actions already taken, and define the next owner.",
	];
	const normalizedQuery = query.toLowerCase();
	const matches = runbook.filter((entry) =>
		entry.toLowerCase().includes(normalizedQuery),
	);
	return (matches.length > 0 ? matches : runbook.slice(0, 2)).join("\n");
}

function lookupAccount(accountId: string): string {
	return JSON.stringify(
		{
			accountId,
			plan: "Enterprise",
			products: ["Workers", "Workers AI", "AI Gateway", "D1"],
			openItems: [
				"AI Gateway cache policy not configured",
				"Production Worker has observability enabled",
			],
		},
		null,
		2,
	);
}

function createFollowUpTask(title: string, priority: string): string {
	return JSON.stringify(
		{
			taskId: `TASK-${crypto.randomUUID().slice(0, 8)}`,
			title,
			priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
			status: "created_in_demo_only",
		},
		null,
		2,
	);
}

async function callMcpTool(
	env: Env,
	toolName: string,
	args: Record<string, unknown>,
): Promise<string> {
	if (!env.MCP_SERVER_URL) {
		return "MCP is not configured. Set MCP_SERVER_URL and MCP_TOOL_ALLOWLIST in wrangler.jsonc to enable remote MCP tools.";
	}

	const allowedTools = getAllowedMcpTools(env);
	if (!allowedTools.includes(toolName)) {
		return `MCP tool '${toolName}' is not allowlisted. Allowed MCP tools: ${allowedTools.join(", ") || "none"}.`;
	}

	const response = await fetch(env.MCP_SERVER_URL, {
		method: "POST",
		headers: buildMcpHeaders(env),
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: crypto.randomUUID(),
			method: "tools/call",
			params: {
				name: toolName,
				arguments: args,
			},
		}),
	});

	const responseText = await response.text();
	if (!response.ok) {
		return `MCP server returned ${response.status}: ${responseText}`;
	}

	return formatMcpResponse(responseText, response.headers.get("content-type") ?? "");
}

async function callUserMcpTool(
	userMcpServers: UserMcpServer[],
	serverId: string,
	toolName: string,
	args: Record<string, unknown>,
): Promise<string> {
	if (!serverId) {
		return "Error: No MCP server ID provided";
	}

	const server = userMcpServers.find((s) => s.id === serverId);
	if (!server) {
		return `Error: MCP server '${serverId}' not found or not enabled`;
	}

	// Check tool allowlist if configured
	if (server.toolAllowlist.length > 0 && !server.toolAllowlist.includes(toolName)) {
		return `MCP tool '${toolName}' is not allowed on server '${server.name}'. Allowed tools: ${server.toolAllowlist.join(", ")}`;
	}

	const headers: Record<string, string> = {
		"accept": "application/json, text/event-stream",
		"content-type": "application/json",
	};

	if (server.authToken) {
		headers["authorization"] = `Bearer ${server.authToken}`;
	}

	try {
		const response = await fetch(server.url, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: crypto.randomUUID(),
				method: "tools/call",
				params: {
					name: toolName,
					arguments: args,
				},
			}),
		});

		const responseText = await response.text();
		if (!response.ok) {
			return `MCP server '${server.name}' returned ${response.status}: ${responseText}`;
		}

		return formatMcpResponse(responseText, response.headers.get("content-type") ?? "");
	} catch (error) {
		return `Error calling MCP server '${server.name}': ${error instanceof Error ? error.message : "Unknown error"}`;
	}
}

function buildMcpHeaders(env: Env): HeadersInit {
	const headers: Record<string, string> = {
		accept: "application/json, text/event-stream",
		"content-type": "application/json",
	};

	if (env.MCP_AUTH_TOKEN) {
		headers.authorization = `Bearer ${env.MCP_AUTH_TOKEN}`;
	}

	return headers;
}

function formatMcpResponse(responseText: string, contentType: string): string {
	const payload = contentType.includes("text/event-stream")
		? extractLastMcpSseEvent(responseText)
		: responseText;

	try {
		const json = JSON.parse(payload) as {
			result?: unknown;
			error?: { message?: string };
		};
		if (json.error) {
			return `MCP error: ${json.error.message ?? JSON.stringify(json.error)}`;
		}
		return typeof json.result === "string"
			? json.result
			: JSON.stringify(json.result ?? json, null, 2);
	} catch {
		return payload;
	}
}

function extractLastMcpSseEvent(responseText: string): string {
	const parsed = consumeSseEvents(responseText + "\n\n");
	return parsed.events[parsed.events.length - 1] ?? responseText;
}

function getAllowedMcpTools(env: Env): string[] {
	return (env.MCP_TOOL_ALLOWLIST ?? "")
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean);
}

function parsePlan(
	text: string,
	messages: ChatMessage[],
	skill?: Skill,
): AgentPlan {
	try {
		const parsed = JSON.parse(extractJsonObject(text)) as Partial<AgentPlan>;
		const toolCalls = Array.isArray(parsed.tool_calls)
			? parsed.tool_calls
					.filter(isAllowedToolCall)
					.filter((toolCall) => isToolAllowedForSkill(toolCall, skill))
					.slice(0, MAX_TOOL_CALLS)
			: [];

		return {
			thought: String(parsed.thought ?? "Use available context to answer."),
			tool_calls: toolCalls,
		};
	} catch (error) {
		console.error("Error parsing agent plan:", error, text);
		return createFallbackPlan(
			messages,
			skill,
			"Planner response was not valid JSON, so the agent will use the runbook search fallback.",
		);
	}
}

function createFallbackPlan(
	messages: ChatMessage[],
	skill: Skill | undefined,
	thought: string,
): AgentPlan {
	const lastUserMessage = [...messages]
		.reverse()
		.find((message) => message.role === "user")?.content;
	const fallbackTool = getFallbackToolForSkill(skill);

	return {
		thought,
		tool_calls: fallbackTool
			? [
					{
						name: fallbackTool,
						arguments:
							fallbackTool === "lookup_account"
								? { accountId: "demo-account" }
								: { query: lastUserMessage ?? "agent workflow" },
					},
				]
			: [],
	};
}

function createFallbackAnswer(plan: AgentPlan, toolResults: ToolResult[]): string {
	const tools = toolResults.map((toolResult) => toolResult.name).join(", ");
	const results = toolResults
		.map((toolResult) => `${toolResult.name}: ${toolResult.result}`)
		.join("\n\n");

	return [
		"I could not reach Workers AI for the final response, so this is a local fallback answer.",
		`Plan: ${plan.thought}`,
		`Tools used: ${tools || "none"}.`,
		results ? `Tool results:\n${results}` : "No tool results were available.",
	].join("\n\n");
}

function getFallbackToolForSkill(skill?: Skill): ToolName | undefined {
	const localFallbacks: ToolName[] = ["search_runbook", "lookup_account"];
	if (!skill || skill.allowedTools.length === 0) return "search_runbook";

	return localFallbacks.find((toolName) => skill.allowedTools.includes(toolName));
}

function isToolAllowedForSkill(toolCall: ToolCall, skill?: Skill): boolean {
	if (!skill || skill.allowedTools.length === 0) return true;

	if (toolCall.name !== "call_mcp_tool") {
		return skill.allowedTools.includes(toolCall.name);
	}

	const mcpToolName = String(toolCall.arguments.toolName ?? "");
	return (
		skill.allowedTools.includes("call_mcp_tool") ||
		skill.allowedTools.includes(`mcp:${mcpToolName}`)
	);
}

function isAllowedToolCall(value: unknown): value is ToolCall {
	if (!value || typeof value !== "object") return false;
	const toolCall = value as { name?: unknown; arguments?: unknown };
	return (
		(toolCall.name === "search_runbook" ||
			toolCall.name === "lookup_account" ||
			toolCall.name === "create_follow_up_task" ||
			toolCall.name === "call_mcp_tool") &&
		typeof toolCall.arguments === "object" &&
		toolCall.arguments !== null
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFrontmatter(markdown: string): Record<string, string> {
	if (!markdown.startsWith("---\n")) return {};

	const end = markdown.indexOf("\n---", 4);
	if (end === -1) return {};

	const lines = markdown.slice(4, end).split("\n");
	const frontmatter: Record<string, string> = {};
	let currentKey = "";

	for (const line of lines) {
		const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (keyMatch) {
			currentKey = keyMatch[1];
			frontmatter[currentKey] = keyMatch[2];
			continue;
		}

		const listItemMatch = line.match(/^\s*-\s*(.*)$/);
		if (currentKey && listItemMatch) {
			frontmatter[currentKey] = frontmatter[currentKey]
				? `${frontmatter[currentKey]},${listItemMatch[1]}`
				: listItemMatch[1];
		}
	}

	return frontmatter;
}

function parseFrontmatterList(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function stripFrontmatter(markdown: string): string {
	if (!markdown.startsWith("---\n")) return markdown;

	const end = markdown.indexOf("\n---", 4);
	if (end === -1) return markdown;

	return markdown.slice(end + "\n---".length).trim();
}

function extractJsonObject(text: string): string {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) {
		throw new Error("No JSON object found in model response");
	}
	return text.slice(start, end + 1);
}

function extractTextGenerationResponse(result: unknown): string {
	if (typeof result === "string") return result;
	if (result && typeof result === "object" && "response" in result) {
		return String((result as { response: unknown }).response ?? "");
	}
	return JSON.stringify(result);
}

function consumeSseEvents(buffer: string): { events: string[]; buffer: string } {
	let normalized = buffer.replace(/\r/g, "");
	const events: string[] = [];
	let eventEndIndex: number;

	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);
		const dataLines = rawEvent
			.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice("data:".length).trimStart());

		if (dataLines.length > 0) {
			events.push(dataLines.join("\n"));
		}
	}

	return { events, buffer: normalized };
}

function sendAgentEvent(
	controller: ReadableStreamDefaultController,
	event: AgentEvent,
): void {
	controller.enqueue(
		new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
	);
}

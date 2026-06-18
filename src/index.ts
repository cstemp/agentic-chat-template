/**
 * Agent Workflow Template
 *
 * A minimal Cloudflare Workers AI agent that plans, calls allowlisted tools,
 * and streams the final response back to the browser with Server-Sent Events.
 *
 * @license MIT
 */
import { ChatMessage, Env } from "./types";

// Model ID for Workers AI model.
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

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

const SYSTEM_PROMPT = `You are a lightweight workflow agent. Your job is to help a user accomplish an operational task by deciding whether to call a small set of tools, reviewing the tool results, and producing a concise answer.

This is a starter template. Tools return mock data so builders can replace them with their own APIs, databases, Queues, Workflows, Durable Objects, MCP servers, or third-party services.`;

const BASE_PLANNER_PROMPT = `${SYSTEM_PROMPT}

Available tools:
- search_runbook: Find guidance in a small internal runbook. Arguments: { "query": string }
- lookup_account: Look up mock customer/account context. Arguments: { "accountId": string }
- create_follow_up_task: Create a mock follow-up task. Arguments: { "title": string, "priority": "low" | "medium" | "high" }

Return only JSON with this shape:
{
  "thought": "brief reason for the plan",
  "tool_calls": [
    { "name": "search_runbook", "arguments": { "query": "..." } }
  ]
}

Use at most ${MAX_TOOL_CALLS} tool calls. Use no tools if the user only needs a direct answer.`;

type ToolName =
	| "search_runbook"
	| "lookup_account"
	| "create_follow_up_task"
	| "call_mcp_tool";

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
			return env.ASSETS.fetch(request);
		}

		// API Routes
		if (url.pathname === "/api/skills") {
			if (request.method === "GET") {
				return Response.json({ skills: SKILLS });
			}

			return new Response("Method not allowed", { status: 405 });
		}

		if (url.pathname === "/api/agent") {
			// Handle POST requests for agent runs.
			if (request.method === "POST") {
				return handleAgentRequest(request, env);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405 });
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles agent workflow requests.
 */
async function handleAgentRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	let messages: ChatMessage[];
	let selectedSkillName: string | undefined;

	try {
		const body = (await request.json()) as {
			messages: ChatMessage[];
			skill?: string;
		};
		messages = Array.isArray(body.messages) ? body.messages : [];
		selectedSkillName = typeof body.skill === "string" ? body.skill : undefined;
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON request body" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	}

	const stream = new ReadableStream({
		async start(controller) {
			try {
				const skill = await loadSkill(selectedSkillName, env);
				if (skill) {
					sendAgentEvent(controller, {
						type: "status",
						message: `Loaded skill: ${skill.name}`,
					});
				}

				sendAgentEvent(controller, {
					type: "status",
					message: "Planning the workflow",
				});

				const plan = await createPlan(messages, env, skill);
				sendAgentEvent(controller, {
					type: "plan",
					thought: plan.thought,
					toolCalls: plan.tool_calls,
				});

				const toolResults: ToolResult[] = [];
				for (const toolCall of plan.tool_calls.slice(0, MAX_TOOL_CALLS)) {
					sendAgentEvent(controller, {
						type: "status",
						message: `Running ${toolCall.name}`,
					});

					const result = await runTool(toolCall, env);
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

				sendAgentEvent(controller, {
					type: "status",
					message: "Composing final answer",
				});
				await streamFinalAnswer(messages, plan, toolResults, env, controller, skill);
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
): Promise<AgentPlan> {
	const plannerMessages: ChatMessage[] = [
		{ role: "system", content: buildPlannerPrompt(env, skill) },
		...messages.filter((message) => message.role !== "system"),
	];

	const result = await env.AI.run<typeof MODEL_ID>(MODEL_ID, {
		messages: plannerMessages,
		max_tokens: 512,
	});

	const text = extractTextGenerationResponse(result);
	return parsePlan(text, messages, skill);
}

async function streamFinalAnswer(
	messages: ChatMessage[],
	plan: AgentPlan,
	toolResults: ToolResult[],
	env: Env,
	controller: ReadableStreamDefaultController,
	skill?: Skill,
): Promise<void> {
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
			content: `Agent plan:\n${JSON.stringify(plan, null, 2)}\n\nTool results:\n${JSON.stringify(toolResults, null, 2)}\n\nWrite the final answer. Keep it brief, explain which tools were used, and include clear next steps if useful.`,
		},
	];

	const aiStream = await env.AI.run<typeof MODEL_ID>(
		MODEL_ID,
		{
			messages: finalMessages,
			max_tokens: 1024,
			stream: true,
		} satisfies AiTextGenerationInput & { stream: true },
		{
			// Uncomment to use AI Gateway.
			// gateway: {
			//   id: "YOUR_GATEWAY_ID", // Replace with your AI Gateway ID
			//   skipCache: false,      // Set to true to bypass cache
			//   cacheTtl: 3600,        // Cache time-to-live in seconds
			// },
		},
	);

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

async function runTool(toolCall: ToolCall, env: Env): Promise<string> {
	switch (toolCall.name) {
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
	}
}

function buildPlannerPrompt(env: Env, skill?: Skill): string {
	const mcpTools = getAllowedMcpTools(env);
	const skillPrompt = skill
		? `\n\nSelected skill:\n${formatSkillForPrompt(skill)}\n\nPrefer the selected skill's workflow and output style when planning.`
		: "";

	if (mcpTools.length === 0 || !env.MCP_SERVER_URL) {
		return `${BASE_PLANNER_PROMPT}${skillPrompt}`;
	}

	return `${BASE_PLANNER_PROMPT}

Optional MCP bridge:
- call_mcp_tool: Call one allowlisted remote MCP tool. Arguments: { "toolName": string, "arguments": object }

Allowed MCP tool names: ${mcpTools.join(", ")}

Only use call_mcp_tool when one of the allowed MCP tools is directly relevant. Never invent MCP tool names.${skillPrompt}`;
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
		const lastUserMessage = [...messages]
			.reverse()
			.find((message) => message.role === "user")?.content;
		const fallbackTool = getFallbackToolForSkill(skill);

		return {
			thought: "Planner response was not valid JSON, so the agent will use the runbook search fallback.",
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

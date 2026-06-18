/**
 * Type definitions for the agent workflow application.
 */

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Binding for static assets.
	 */
	ASSETS: { fetch: (request: Request) => Promise<Response> };

	/**
	 * Optional remote MCP server endpoint for JSON-RPC tool calls.
	 */
	MCP_SERVER_URL?: string;

	/**
	 * Comma-separated list of MCP tool names this Worker may call.
	 */
	MCP_TOOL_ALLOWLIST?: string;

	/**
	 * Optional bearer token. Set with `wrangler secret put MCP_AUTH_TOKEN`.
	 */
	MCP_AUTH_TOKEN?: string;
}

/**
 * Represents a chat message sent to Workers AI.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

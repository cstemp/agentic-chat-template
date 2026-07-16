/**
 * Type definitions for the agent workflow application.
 */

/**
 * Browser Run binding type.
 * @see https://developers.cloudflare.com/browser-run/
 */
export interface BrowserRun {
	/**
	 * Execute a quick action without managing browser lifecycle.
	 */
	quickAction(
		action: 'markdown' | 'screenshot' | 'pdf' | 'scrape',
		options: {
			url: string;
			gotoOptions?: {
				waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
			};
		}
	): Promise<Response>;
}

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
	 * D1 database for workspace persistence.
	 */
	DB: D1Database;

	/**
	 * Browser Run binding for web scraping and content extraction.
	 * https://developers.cloudflare.com/browser-run/
	 */
	BROWSER?: BrowserRun;

	/**
	 * Optional AI Gateway ID. When set, all AI requests route through the gateway
	 * for analytics, caching, and rate limiting.
	 */
	AI_GATEWAY_ID?: string;

	/**
	 * Optional: Skip AI Gateway cache. Set to "true" to bypass caching.
	 */
	AI_GATEWAY_SKIP_CACHE?: string;

	/**
	 * Optional: AI Gateway cache TTL in seconds. Defaults to 3600.
	 */
	AI_GATEWAY_CACHE_TTL?: string;

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

	/**
	 * Set to "true" to allow dev user header (X-Dev-User-Email) for local testing.
	 */
	ALLOW_DEV_AUTH?: string;
}

/**
 * Represents a chat message sent to Workers AI.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * Database access layer for workspace persistence.
 */

import { AccessUser } from "./auth";

export interface DbWorkspace {
	id: string;
	user_id: string;
	title: string;
	color: string;
	selected_model: string;
	selected_skill: string;
	is_favorite: number;
	created_at: number;
	updated_at: number;
}

export interface DbMessage {
	id: string;
	workspace_id: string;
	role: "user" | "assistant";
	content: string;
	created_at: number;
}

export interface DbMessageAttachment {
	id: string;
	message_id: string;
	name: string;
	type: "image" | "document" | "other";
	size: number;
	preview: string | null;
}

export interface DbMessageStep {
	id: number;
	message_id: string;
	step_type: "status" | "plan" | "tool_result" | "error";
	content: string;
	data: string | null;
	step_order: number;
}

// API response types
export interface WorkspaceResponse {
	id: string;
	title: string;
	color: string;
	selectedModel: string;
	selectedSkill: string;
	isFavorite: boolean;
	createdAt: number;
	updatedAt: number;
	messages?: MessageResponse[];
}

export interface MessageResponse {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	attachments?: AttachmentResponse[];
	steps?: StepResponse[];
}

export interface AttachmentResponse {
	id: string;
	name: string;
	type: "image" | "document" | "other";
	size: number;
	preview?: string;
}

export interface StepResponse {
	type: "status" | "plan" | "tool_result" | "error";
	content: string;
	data?: unknown;
}

function generateId(prefix: string): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Ensure user exists in database (upsert on first visit).
 */
export async function ensureUser(db: D1Database, user: AccessUser): Promise<void> {
	await db
		.prepare(
			`INSERT INTO users (id, email, name, created_at, last_seen_at)
			 VALUES (?, ?, ?, unixepoch(), unixepoch())
			 ON CONFLICT(id) DO UPDATE SET
				 last_seen_at = unixepoch(),
				 name = COALESCE(excluded.name, users.name)`
		)
		.bind(user.id, user.email, user.name || null)
		.run();
}

/**
 * Get all workspaces for a user.
 */
export async function getWorkspaces(
	db: D1Database,
	userId: string
): Promise<WorkspaceResponse[]> {
	const result = await db
		.prepare(
			`SELECT * FROM workspaces 
			 WHERE user_id = ? 
			 ORDER BY updated_at DESC`
		)
		.bind(userId)
		.all<DbWorkspace>();

	return (result.results || []).map(mapWorkspace);
}

/**
 * Get a single workspace with all messages.
 */
export async function getWorkspace(
	db: D1Database,
	userId: string,
	workspaceId: string
): Promise<WorkspaceResponse | null> {
	// Get workspace
	const workspace = await db
		.prepare(`SELECT * FROM workspaces WHERE id = ? AND user_id = ?`)
		.bind(workspaceId, userId)
		.first<DbWorkspace>();

	if (!workspace) {
		return null;
	}

	// Get messages
	const messages = await db
		.prepare(
			`SELECT * FROM messages 
			 WHERE workspace_id = ? 
			 ORDER BY created_at ASC`
		)
		.bind(workspaceId)
		.all<DbMessage>();

	// Get attachments and steps for each message
	const messageResponses: MessageResponse[] = [];
	for (const msg of messages.results || []) {
		const attachments = await db
			.prepare(`SELECT * FROM message_attachments WHERE message_id = ?`)
			.bind(msg.id)
			.all<DbMessageAttachment>();

		const steps = await db
			.prepare(
				`SELECT * FROM message_steps 
				 WHERE message_id = ? 
				 ORDER BY step_order ASC`
			)
			.bind(msg.id)
			.all<DbMessageStep>();

		messageResponses.push({
			id: msg.id,
			role: msg.role,
			content: msg.content,
			timestamp: msg.created_at * 1000,
			attachments: (attachments.results || []).map((a) => ({
				id: a.id,
				name: a.name,
				type: a.type,
				size: a.size,
				preview: a.preview || undefined,
			})),
			steps: (steps.results || []).map((s) => ({
				type: s.step_type,
				content: s.content,
				data: s.data ? JSON.parse(s.data) : undefined,
			})),
		});
	}

	return {
		...mapWorkspace(workspace),
		messages: messageResponses,
	};
}

/**
 * Create a new workspace.
 */
export async function createWorkspace(
	db: D1Database,
	userId: string,
	data: { title?: string; color?: string }
): Promise<WorkspaceResponse> {
	const id = generateId("ws");
	const title = data.title || "New Workspace";
	const color = data.color || getRandomColor();
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`INSERT INTO workspaces (id, user_id, title, color, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, userId, title, color, now, now)
		.run();

	return {
		id,
		title,
		color,
		selectedModel: "llama-3.1-8b-instruct",
		selectedSkill: "",
		isFavorite: false,
		createdAt: now * 1000,
		updatedAt: now * 1000,
	};
}

/**
 * Update a workspace.
 */
export async function updateWorkspace(
	db: D1Database,
	userId: string,
	workspaceId: string,
	data: Partial<{
		title: string;
		color: string;
		selectedModel: string;
		selectedSkill: string;
		isFavorite: boolean;
	}>
): Promise<boolean> {
	const updates: string[] = [];
	const values: (string | number)[] = [];

	if (data.title !== undefined) {
		updates.push("title = ?");
		values.push(data.title);
	}
	if (data.color !== undefined) {
		updates.push("color = ?");
		values.push(data.color);
	}
	if (data.selectedModel !== undefined) {
		updates.push("selected_model = ?");
		values.push(data.selectedModel);
	}
	if (data.selectedSkill !== undefined) {
		updates.push("selected_skill = ?");
		values.push(data.selectedSkill);
	}
	if (data.isFavorite !== undefined) {
		updates.push("is_favorite = ?");
		values.push(data.isFavorite ? 1 : 0);
	}

	if (updates.length === 0) {
		return true;
	}

	updates.push("updated_at = unixepoch()");

	const result = await db
		.prepare(
			`UPDATE workspaces SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
		)
		.bind(...values, workspaceId, userId)
		.run();

	return result.meta.changes > 0;
}

/**
 * Delete a workspace.
 */
export async function deleteWorkspace(
	db: D1Database,
	userId: string,
	workspaceId: string
): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM workspaces WHERE id = ? AND user_id = ?`)
		.bind(workspaceId, userId)
		.run();

	return result.meta.changes > 0;
}

/**
 * Add a message to a workspace.
 */
export async function addMessage(
	db: D1Database,
	userId: string,
	workspaceId: string,
	data: {
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
	}
): Promise<MessageResponse> {
	// Verify workspace belongs to user
	const workspace = await db
		.prepare(`SELECT id FROM workspaces WHERE id = ? AND user_id = ?`)
		.bind(workspaceId, userId)
		.first();

	if (!workspace) {
		throw new Error("Workspace not found");
	}

	const messageId = generateId("msg");
	const now = Math.floor(Date.now() / 1000);

	// Insert message
	await db
		.prepare(
			`INSERT INTO messages (id, workspace_id, role, content, created_at)
			 VALUES (?, ?, ?, ?, ?)`
		)
		.bind(messageId, workspaceId, data.role, data.content, now)
		.run();

	// Insert attachments
	if (data.attachments && data.attachments.length > 0) {
		for (const att of data.attachments) {
			await db
				.prepare(
					`INSERT INTO message_attachments (id, message_id, name, type, size, preview)
					 VALUES (?, ?, ?, ?, ?, ?)`
				)
				.bind(att.id, messageId, att.name, att.type, att.size, att.preview || null)
				.run();
		}
	}

	// Insert steps
	if (data.steps && data.steps.length > 0) {
		for (let i = 0; i < data.steps.length; i++) {
			const step = data.steps[i];
			await db
				.prepare(
					`INSERT INTO message_steps (message_id, step_type, content, data, step_order)
					 VALUES (?, ?, ?, ?, ?)`
				)
				.bind(
					messageId,
					step.type,
					step.content,
					step.data ? JSON.stringify(step.data) : null,
					i
				)
				.run();
		}
	}

	// Update workspace timestamp and maybe title
	if (data.role === "user") {
		// Auto-update title from first user message
		const existingMessages = await db
			.prepare(`SELECT COUNT(*) as count FROM messages WHERE workspace_id = ?`)
			.bind(workspaceId)
			.first<{ count: number }>();

		if (existingMessages && existingMessages.count === 1) {
			const newTitle = data.content.slice(0, 50) + (data.content.length > 50 ? "..." : "");
			await db
				.prepare(`UPDATE workspaces SET title = ?, updated_at = unixepoch() WHERE id = ?`)
				.bind(newTitle, workspaceId)
				.run();
		} else {
			await db
				.prepare(`UPDATE workspaces SET updated_at = unixepoch() WHERE id = ?`)
				.bind(workspaceId)
				.run();
		}
	}

	return {
		id: messageId,
		role: data.role,
		content: data.content,
		timestamp: now * 1000,
		attachments: data.attachments?.map((a) => ({
			id: a.id,
			name: a.name,
			type: a.type,
			size: a.size,
			preview: a.preview,
		})),
		steps: data.steps?.map((s) => ({
			type: s.type,
			content: s.content,
			data: s.data,
		})),
	};
}

/**
 * Update a message (e.g., to add streaming content or steps).
 */
export async function updateMessage(
	db: D1Database,
	userId: string,
	workspaceId: string,
	messageId: string,
	data: {
		content?: string;
		steps?: {
			type: "status" | "plan" | "tool_result" | "error";
			content: string;
			data?: unknown;
		}[];
	}
): Promise<boolean> {
	// Verify ownership
	const workspace = await db
		.prepare(`SELECT id FROM workspaces WHERE id = ? AND user_id = ?`)
		.bind(workspaceId, userId)
		.first();

	if (!workspace) {
		return false;
	}

	// Update content if provided
	if (data.content !== undefined) {
		await db
			.prepare(`UPDATE messages SET content = ? WHERE id = ? AND workspace_id = ?`)
			.bind(data.content, messageId, workspaceId)
			.run();
	}

	// Replace steps if provided
	if (data.steps !== undefined) {
		// Delete existing steps
		await db
			.prepare(`DELETE FROM message_steps WHERE message_id = ?`)
			.bind(messageId)
			.run();

		// Insert new steps
		for (let i = 0; i < data.steps.length; i++) {
			const step = data.steps[i];
			await db
				.prepare(
					`INSERT INTO message_steps (message_id, step_type, content, data, step_order)
					 VALUES (?, ?, ?, ?, ?)`
				)
				.bind(
					messageId,
					step.type,
					step.content,
					step.data ? JSON.stringify(step.data) : null,
					i
				)
				.run();
		}
	}

	return true;
}

// Helper functions

function mapWorkspace(row: DbWorkspace): WorkspaceResponse {
	return {
		id: row.id,
		title: row.title,
		color: row.color,
		selectedModel: row.selected_model,
		selectedSkill: row.selected_skill,
		isFavorite: row.is_favorite === 1,
		createdAt: row.created_at * 1000,
		updatedAt: row.updated_at * 1000,
	};
}

const COLORS = [
	"#f97316",
	"#ef4444",
	"#8b5cf6",
	"#3b82f6",
	"#22c55e",
	"#eab308",
	"#ec4899",
	"#06b6d4",
];

function getRandomColor(): string {
	return COLORS[Math.floor(Math.random() * COLORS.length)];
}

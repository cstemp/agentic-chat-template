/**
 * API client for workspace operations.
 */

export interface User {
  authenticated: boolean;
  id?: string;
  email?: string;
  name?: string;
}

export interface Workspace {
  id: string;
  title: string;
  color: string;
  selectedModel: string;
  selectedSkill: string;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  messages?: Message[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
  steps?: MessageStep[];
}

export interface MessageAttachment {
  id: string;
  name: string;
  type: 'image' | 'document' | 'other';
  size: number;
  preview?: string;
}

export interface MessageStep {
  type: 'status' | 'plan' | 'tool_result' | 'error';
  content: string;
  data?: unknown;
}

export interface Skill {
  name: string;
  description: string;
  tools?: string[];
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // In development, add dev user header if no Access JWT
  if (import.meta.env.DEV) {
    const devEmail = localStorage.getItem('dev-user-email') || 'dev@example.com';
    headers['X-Dev-User-Email'] = devEmail;
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || 'Request failed');
  }

  return response.json();
}

// User API
export async function getCurrentUser(): Promise<User> {
  return fetchApi<User>('/me');
}

// Workspace API
export async function getWorkspaces(): Promise<Workspace[]> {
  const data = await fetchApi<{ workspaces: Workspace[] }>('/workspaces');
  return data.workspaces;
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const data = await fetchApi<{ workspace: Workspace }>(`/workspaces/${id}`);
  return data.workspace;
}

export async function createWorkspace(data?: {
  title?: string;
  color?: string;
}): Promise<Workspace> {
  const result = await fetchApi<{ workspace: Workspace }>('/workspaces', {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
  return result.workspace;
}

export async function updateWorkspace(
  id: string,
  data: Partial<{
    title: string;
    color: string;
    selectedModel: string;
    selectedSkill: string;
    isFavorite: boolean;
  }>
): Promise<void> {
  await fetchApi(`/workspaces/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  await fetchApi(`/workspaces/${id}`, {
    method: 'DELETE',
  });
}

// Message API
export async function addMessage(
  workspaceId: string,
  data: {
    role: 'user' | 'assistant';
    content: string;
    attachments?: MessageAttachment[];
    steps?: MessageStep[];
  }
): Promise<Message> {
  const result = await fetchApi<{ message: Message }>(
    `/workspaces/${workspaceId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return result.message;
}

export async function updateMessage(
  workspaceId: string,
  messageId: string,
  data: {
    content?: string;
    steps?: MessageStep[];
  }
): Promise<void> {
  await fetchApi(`/workspaces/${workspaceId}/messages/${messageId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Skills API
export async function getSkills(): Promise<Skill[]> {
  const data = await fetchApi<{ skills: Skill[] }>('/skills');
  return data.skills;
}

// Models API
export interface Model {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

export async function getModels(): Promise<Model[]> {
  const data = await fetchApi<{ models: Model[] }>('/models');
  return data.models;
}

// Agent API (streaming)
export async function runAgent(
  messages: { role: string; content: string }[],
  options: {
    skill?: string;
    model?: string;
  } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // In development, add dev user header
  if (import.meta.env.DEV) {
    const devEmail = localStorage.getItem('dev-user-email') || 'dev@example.com';
    headers['X-Dev-User-Email'] = devEmail;
  }

  return fetch('/api/agent', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      skill: options.skill,
      model: options.model,
    }),
  });
}

// MCP Server API
export interface McpServer {
  id: string;
  name: string;
  url: string;
  toolAllowlist: string[];
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface McpServerTool {
  name: string;
  description?: string;
}

export interface McpTestResult {
  success: boolean;
  error?: string;
  tools?: McpServerTool[];
}

export async function getMcpServers(): Promise<McpServer[]> {
  const data = await fetchApi<{ servers: McpServer[] }>('/mcp-servers');
  return data.servers;
}

export async function getMcpServer(id: string): Promise<McpServer> {
  const data = await fetchApi<{ server: McpServer }>(`/mcp-servers/${id}`);
  return data.server;
}

export async function createMcpServer(data: {
  name: string;
  url: string;
  authToken?: string;
  toolAllowlist?: string[];
}): Promise<McpServer> {
  const result = await fetchApi<{ server: McpServer }>('/mcp-servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.server;
}

export async function updateMcpServer(
  id: string,
  data: Partial<{
    name: string;
    url: string;
    authToken: string;
    toolAllowlist: string[];
    isEnabled: boolean;
  }>
): Promise<void> {
  await fetchApi(`/mcp-servers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteMcpServer(id: string): Promise<void> {
  await fetchApi(`/mcp-servers/${id}`, {
    method: 'DELETE',
  });
}

export async function testMcpServer(id: string): Promise<McpTestResult> {
  return fetchApi<McpTestResult>(`/mcp-servers/${id}/test`, {
    method: 'POST',
  });
}

export { ApiError };

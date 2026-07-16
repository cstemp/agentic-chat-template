import { useState, useEffect, useCallback } from 'react';
import * as api from '../lib/api';

// Re-export types from API
export type {
  Workspace,
  Message,
  MessageAttachment,
  MessageStep,
} from '../lib/api';

// Legacy type alias for compatibility
export type AgentStep = api.MessageStep;

const COLORS = [
  '#f97316',
  '#ef4444',
  '#8b5cf6',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#ec4899',
  '#06b6d4',
];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<api.Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  const createWorkspace = useCallback(async (): Promise<api.Workspace> => {
    try {
      const workspace = await api.createWorkspace({
        title: 'New Workspace',
        color: getRandomColor(),
      });
      setWorkspaces((prev) => [workspace, ...prev]);
      return workspace;
    } catch (err) {
      console.error('Failed to create workspace:', err);
      throw err;
    }
  }, []);

  const updateWorkspace = useCallback(
    async (id: string, updates: Partial<api.Workspace>) => {
      try {
        await api.updateWorkspace(id, updates);
        setWorkspaces((prev) =>
          prev.map((ws) =>
            ws.id === id ? { ...ws, ...updates, updatedAt: Date.now() } : ws
          )
        );
      } catch (err) {
        console.error('Failed to update workspace:', err);
        throw err;
      }
    },
    []
  );

  const deleteWorkspace = useCallback(async (id: string) => {
    try {
      await api.deleteWorkspace(id);
      setWorkspaces((prev) => prev.filter((ws) => ws.id !== id));
    } catch (err) {
      console.error('Failed to delete workspace:', err);
      throw err;
    }
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    const workspace = workspaces.find((ws) => ws.id === id);
    if (!workspace) return;

    try {
      await api.updateWorkspace(id, { isFavorite: !workspace.isFavorite });
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === id ? { ...ws, isFavorite: !ws.isFavorite } : ws
        )
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      throw err;
    }
  }, [workspaces]);

  const getWorkspace = useCallback(
    (id: string): api.Workspace | undefined => {
      return workspaces.find((ws) => ws.id === id);
    },
    [workspaces]
  );

  // Derived state
  const favorites = workspaces
    .filter((ws) => ws.isFavorite)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const recent = workspaces
    .filter((ws) => !ws.isFavorite)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    workspaces,
    favorites,
    recent,
    loading,
    error,
    loadWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    toggleFavorite,
    getWorkspace,
  };
}

/**
 * Hook for managing a single workspace and its messages.
 */
export function useWorkspace(workspaceId: string | undefined) {
  const [workspace, setWorkspace] = useState<api.Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspace(null);
      setLoading(false);
      return;
    }

    loadWorkspace(workspaceId);
  }, [workspaceId]);

  const loadWorkspace = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getWorkspace(id);
      setWorkspace(data);
    } catch (err) {
      console.error('Failed to load workspace:', err);
      setError(err instanceof Error ? err.message : 'Failed to load workspace');
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  };

  const addMessage = useCallback(
    async (data: {
      role: 'user' | 'assistant';
      content: string;
      attachments?: api.MessageAttachment[];
      steps?: api.MessageStep[];
    }): Promise<api.Message> => {
      if (!workspaceId) {
        throw new Error('No workspace ID');
      }

      const message = await api.addMessage(workspaceId, data);

      // Update local state
      setWorkspace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...(prev.messages || []), message],
          updatedAt: Date.now(),
          // Update title from first user message
          title:
            (!prev.messages || prev.messages.length === 0) && data.role === 'user'
              ? data.content.slice(0, 50) + (data.content.length > 50 ? '...' : '')
              : prev.title,
        };
      });

      return message;
    },
    [workspaceId]
  );

  const updateMessage = useCallback(
    (messageId: string, updates: Partial<api.Message>) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: (prev.messages || []).map((msg) =>
            msg.id === messageId ? { ...msg, ...updates } : msg
          ),
        };
      });
    },
    []
  );

  const updateWorkspace = useCallback(
    async (updates: Partial<api.Workspace>) => {
      if (!workspaceId) return;

      try {
        await api.updateWorkspace(workspaceId, updates);
        setWorkspace((prev) => (prev ? { ...prev, ...updates } : prev));
      } catch (err) {
        console.error('Failed to update workspace:', err);
        throw err;
      }
    },
    [workspaceId]
  );

  const toggleFavorite = useCallback(async () => {
    if (!workspace) return;

    try {
      await api.updateWorkspace(workspace.id, {
        isFavorite: !workspace.isFavorite,
      });
      setWorkspace((prev) =>
        prev ? { ...prev, isFavorite: !prev.isFavorite } : prev
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      throw err;
    }
  }, [workspace]);

  const deleteWorkspace = useCallback(async () => {
    if (!workspaceId) return;

    try {
      await api.deleteWorkspace(workspaceId);
      setWorkspace(null);
    } catch (err) {
      console.error('Failed to delete workspace:', err);
      throw err;
    }
  }, [workspaceId]);

  return {
    workspace,
    loading,
    error,
    loadWorkspace: () => workspaceId && loadWorkspace(workspaceId),
    addMessage,
    updateMessage,
    updateWorkspace,
    toggleFavorite,
    deleteWorkspace,
  };
}

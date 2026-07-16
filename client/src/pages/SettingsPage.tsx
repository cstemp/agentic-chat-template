import { useEffect, useState } from 'react';
import {
  Settings,
  Plus,
  Server,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Edit2,
  Power,
  TestTube,
} from 'lucide-react';
import {
  getMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  testMcpServer,
  McpServer,
  McpTestResult,
} from '../lib/api';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    try {
      const data = await getMcpServers();
      setServers(data);
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddServer(data: {
    name: string;
    url: string;
    authToken?: string;
    toolAllowlist?: string[];
  }) {
    const server = await createMcpServer(data);
    setServers((prev) => [...prev, server]);
    setShowAddModal(false);
  }

  async function handleUpdateServer(
    id: string,
    data: Partial<{
      name: string;
      url: string;
      authToken: string;
      toolAllowlist: string[];
      isEnabled: boolean;
    }>
  ) {
    await updateMcpServer(id, data);
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...data } : s))
    );
    setEditingServer(null);
  }

  async function handleDeleteServer(id: string) {
    if (!confirm('Are you sure you want to delete this MCP server?')) return;
    await deleteMcpServer(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleToggleEnabled(server: McpServer) {
    await updateMcpServer(server.id, { isEnabled: !server.isEnabled });
    setServers((prev) =>
      prev.map((s) =>
        s.id === server.id ? { ...s, isEnabled: !s.isEnabled } : s
      )
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Settings size={24} className={styles.headerIcon} />
          <div>
            <h1 className={styles.title}>Settings</h1>
            <p className={styles.subtitle}>
              Configure MCP servers and other agent settings
            </p>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <Server size={20} />
            <h2>MCP Servers</h2>
          </div>
          <button
            className={styles.addButton}
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={18} />
            <span>Add Server</span>
          </button>
        </div>

        <p className={styles.sectionDescription}>
          Connect to Model Context Protocol (MCP) servers to extend your agent's
          capabilities with external tools and data sources.
        </p>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading MCP servers...</div>
          ) : servers.length === 0 ? (
            <div className={styles.emptyState}>
              <Server size={48} className={styles.emptyIcon} />
              <h3>No MCP servers configured</h3>
              <p>
                Add an MCP server to give your agent access to external tools.
              </p>
            </div>
          ) : (
            <div className={styles.serverList}>
              {servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  onEdit={() => setEditingServer(server)}
                  onDelete={() => handleDeleteServer(server.id)}
                  onToggleEnabled={() => handleToggleEnabled(server)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className={styles.info}>
        <h3>About MCP Servers</h3>
        <p>
          MCP (Model Context Protocol) is an open standard for connecting AI
          agents to external tools and data sources. Each MCP server can expose
          multiple tools that your agent can use during conversations.
        </p>
        <ul>
          <li>
            <strong>URL:</strong> The endpoint of your MCP server (must support
            HTTP+SSE transport)
          </li>
          <li>
            <strong>Auth Token:</strong> Optional bearer token for authentication
          </li>
          <li>
            <strong>Tool Allowlist:</strong> Restrict which tools the agent can
            use from this server
          </li>
        </ul>
        <p>
          Learn more about MCP at{' '}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
          >
            modelcontextprotocol.io
          </a>
        </p>
      </div>

      {showAddModal && (
        <ServerModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddServer}
        />
      )}

      {editingServer && (
        <ServerModal
          server={editingServer}
          onClose={() => setEditingServer(null)}
          onSave={(data) => handleUpdateServer(editingServer.id, data)}
        />
      )}
    </div>
  );
}

function ServerCard({
  server,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  server: McpServer;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<McpTestResult | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testMcpServer(server.id);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className={`${styles.card} ${!server.isEnabled ? styles.cardDisabled : ''}`}>
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          <Server size={18} />
        </div>
        <div className={styles.cardInfo}>
          <h3 className={styles.cardTitle}>{server.name}</h3>
          <p className={styles.cardUrl}>{server.url}</p>
        </div>
        <div className={styles.cardActions}>
          <button
            className={`${styles.iconButton} ${server.isEnabled ? styles.enabled : ''}`}
            onClick={onToggleEnabled}
            title={server.isEnabled ? 'Disable' : 'Enable'}
          >
            <Power size={16} />
          </button>
          <button
            className={styles.iconButton}
            onClick={handleTest}
            disabled={testing}
            title="Test connection"
          >
            {testing ? <Loader2 size={16} className={styles.spin} /> : <TestTube size={16} />}
          </button>
          <button className={styles.iconButton} onClick={onEdit} title="Edit">
            <Edit2 size={16} />
          </button>
          <button
            className={`${styles.iconButton} ${styles.danger}`}
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {server.toolAllowlist.length > 0 && (
        <div className={styles.cardTools}>
          <span className={styles.toolsLabel}>Allowed tools:</span>
          <div className={styles.toolsList}>
            {server.toolAllowlist.map((tool) => (
              <span key={tool} className={styles.toolBadge}>
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {testResult && (
        <div
          className={`${styles.testResult} ${testResult.success ? styles.success : styles.error}`}
        >
          {testResult.success ? (
            <>
              <CheckCircle size={16} />
              <span>
                Connected! {testResult.tools?.length || 0} tools available
              </span>
            </>
          ) : (
            <>
              <XCircle size={16} />
              <span>{testResult.error}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ServerModal({
  server,
  onClose,
  onSave,
}: {
  server?: McpServer;
  onClose: () => void;
  onSave: (data: {
    name: string;
    url: string;
    authToken?: string;
    toolAllowlist?: string[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState(server?.name || '');
  const [url, setUrl] = useState(server?.url || '');
  const [authToken, setAuthToken] = useState('');
  const [toolAllowlist, setToolAllowlist] = useState(
    server?.toolAllowlist.join(', ') || ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    try {
      new URL(url);
    } catch {
      setError('Invalid URL format');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        url: url.trim(),
        authToken: authToken.trim() || undefined,
        toolAllowlist: toolAllowlist
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>
          {server ? 'Edit MCP Server' : 'Add MCP Server'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Name</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My MCP Server"
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>URL</label>
            <input
              type="text"
              className={styles.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://my-mcp-server.example.com"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              Auth Token <span className={styles.optional}>(optional)</span>
            </label>
            <input
              type="password"
              className={styles.input}
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Bearer token for authentication"
            />
            {server && (
              <p className={styles.hint}>
                Leave empty to keep existing token
              </p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              Tool Allowlist <span className={styles.optional}>(optional)</span>
            </label>
            <input
              type="text"
              className={styles.input}
              value={toolAllowlist}
              onChange={(e) => setToolAllowlist(e.target.value)}
              placeholder="tool1, tool2, tool3"
            />
            <p className={styles.hint}>
              Comma-separated list of tool names. Leave empty to allow all tools.
            </p>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveButton}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className={styles.spin} />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

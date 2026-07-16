import { useNavigate } from 'react-router-dom';
import { Plus, Star, Clock, MoreHorizontal, Trash2 } from 'lucide-react';
import { useWorkspaces } from '../hooks/useWorkspaces';
import styles from './WorkspacesPage.module.css';

export function WorkspacesPage() {
  const navigate = useNavigate();
  const { workspaces, favorites, recent, createWorkspace, deleteWorkspace, toggleFavorite } =
    useWorkspaces();

  const handleNewWorkspace = () => {
    const workspace = createWorkspace();
    navigate(`/workspace/${workspace.id}`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Workspaces</h1>
        <button className={styles.newButton} onClick={handleNewWorkspace}>
          <Plus size={18} />
          <span>New Workspace</span>
        </button>
      </header>

      <div className={styles.content}>
        {/* Favorites Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Star size={16} />
            <h2>Favorites</h2>
            <span className={styles.count}>{favorites.length}</span>
          </div>
          {favorites.length === 0 ? (
            <p className={styles.emptyState}>
              Star workspaces to add them to your favorites.
            </p>
          ) : (
            <div className={styles.grid}>
              {favorites.map((ws) => (
                <WorkspaceCard
                  key={ws.id}
                  workspace={ws}
                  onNavigate={() => navigate(`/workspace/${ws.id}`)}
                  onToggleFavorite={() => toggleFavorite(ws.id)}
                  onDelete={() => deleteWorkspace(ws.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Clock size={16} />
            <h2>Recent</h2>
            <span className={styles.count}>{recent.length}</span>
          </div>
          {recent.length === 0 ? (
            <p className={styles.emptyState}>
              Your recent workspaces will appear here.
            </p>
          ) : (
            <div className={styles.grid}>
              {recent.map((ws) => (
                <WorkspaceCard
                  key={ws.id}
                  workspace={ws}
                  onNavigate={() => navigate(`/workspace/${ws.id}`)}
                  onToggleFavorite={() => toggleFavorite(ws.id)}
                  onDelete={() => deleteWorkspace(ws.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

interface WorkspaceCardProps {
  workspace: {
    id: string;
    title: string;
    color: string;
    isFavorite: boolean;
    updatedAt: number;
    messages: { content: string }[];
  };
  onNavigate: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

function WorkspaceCard({
  workspace,
  onNavigate,
  onToggleFavorite,
  onDelete,
}: WorkspaceCardProps) {
  const lastMessage = workspace.messages[workspace.messages.length - 1];
  const preview = lastMessage?.content.slice(0, 100) || 'No messages yet';
  const updatedDate = new Date(workspace.updatedAt).toLocaleDateString();

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div
          className={styles.cardIcon}
          style={{ backgroundColor: workspace.color }}
        >
          {workspace.title.charAt(0).toUpperCase()}
        </div>
        <div className={styles.cardActions}>
          <button
            className={`${styles.cardAction} ${
              workspace.isFavorite ? styles.favorited : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={workspace.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star size={14} fill={workspace.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            className={styles.cardAction}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete workspace"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <button className={styles.cardBody} onClick={onNavigate}>
        <h3 className={styles.cardTitle}>{workspace.title}</h3>
        <p className={styles.cardPreview}>{preview}</p>
        <span className={styles.cardDate}>Updated {updatedDate}</span>
      </button>
    </div>
  );
}

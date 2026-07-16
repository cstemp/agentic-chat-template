import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  LayoutGrid,
  FileOutput,
  Users,
  Calendar,
  BookOpen,
  Sparkles,
  Search,
  Plus,
  Star,
  Clock,
  Settings,
  Sun,
  Moon,
  Grip,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Theme } from '../App';
import { useWorkspaces, Workspace } from '../hooks/useWorkspaces';
import styles from './Sidebar.module.css';

interface SidebarProps {
  theme: Theme;
  toggleTheme: () => void;
}

export function Sidebar({ theme, toggleTheme }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaces, favorites, recent, createWorkspace, deleteWorkspace, toggleFavorite } = useWorkspaces();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleDeleteWorkspace = async (id: string) => {
    try {
      await deleteWorkspace(id);
      // If we're on the deleted workspace, navigate to home
      if (location.pathname === `/workspace/${id}`) {
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to delete workspace:', error);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      await toggleFavorite(id);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleNewWorkspace = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const workspace = await createWorkspace();
      navigate(`/workspace/${workspace.id}`);
    } catch (error) {
      console.error('Failed to create workspace:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const filteredRecent = recent.filter((ws) =>
    ws.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className={styles.sidebar}>
      {/* Logo/Brand */}
      <div className={styles.brand}>
        <div className={styles.logo}>
          <LayoutGrid size={24} />
        </div>
        <span className={styles.brandName}>Agent Workspace</span>
      </div>

      {/* Main Navigation */}
      <nav className={styles.nav}>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
        >
          <Home size={18} />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/workspaces"
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
        >
          <LayoutGrid size={18} />
          <span>Workspaces</span>
        </NavLink>

        <NavLink
          to="/outputs"
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
        >
          <FileOutput size={18} />
          <span>Outputs</span>
        </NavLink>

        <NavLink
          to="/shared"
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
        >
          <Users size={18} />
          <span>Shared with me</span>
        </NavLink>

        <NavLink
          to="/scheduled"
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
        >
          <Calendar size={18} />
          <span>Scheduled Tasks</span>
        </NavLink>

        <NavLink
          to="/context"
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
        >
          <BookOpen size={18} />
          <span>Context</span>
        </NavLink>

        <NavLink
          to="/skills"
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
        >
          <Sparkles size={18} />
          <span>Skills</span>
        </NavLink>
      </nav>

      {/* Search */}
      <div className={styles.searchContainer}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* New Workspace Button */}
      <button className={styles.newWorkspace} onClick={handleNewWorkspace}>
        <Plus size={18} />
        <span>New workspace</span>
      </button>

      {/* Favorites Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Star size={14} />
          <span>FAVORITES</span>
          <span className={styles.count}>{favorites.length}</span>
        </div>
        {favorites.length === 0 ? (
          <p className={styles.emptyState}>Star a workspace to pin it here.</p>
        ) : (
          <ul className={styles.workspaceList}>
            {favorites.map((ws) => (
              <WorkspaceItem
                key={ws.id}
                workspace={ws}
                onDelete={() => handleDeleteWorkspace(ws.id)}
                onToggleFavorite={() => handleToggleFavorite(ws.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Recent Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Clock size={14} />
          <span>RECENT</span>
          <span className={styles.count}>{recent.length}</span>
        </div>
        <ul className={styles.workspaceList}>
          {filteredRecent.slice(0, 10).map((ws) => (
            <WorkspaceItem
              key={ws.id}
              workspace={ws}
              onDelete={() => handleDeleteWorkspace(ws.id)}
              onToggleFavorite={() => handleToggleFavorite(ws.id)}
            />
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <button className={styles.footerButton} title="Settings">
          <Settings size={18} />
        </button>
        <button
          className={styles.footerButton}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </aside>
  );
}

interface WorkspaceItemProps {
  workspace: Workspace;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

function WorkspaceItem({ workspace, onDelete, onToggleFavorite }: WorkspaceItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <li className={styles.workspaceItem}>
      <NavLink
        to={`/workspace/${workspace.id}`}
        className={styles.workspaceLink}
      >
        <Grip size={12} className={styles.dragHandle} />
        <div
          className={styles.workspaceIcon}
          style={{ backgroundColor: workspace.color }}
        >
          {workspace.title.charAt(0).toUpperCase()}
        </div>
        <span className={styles.workspaceTitle}>{workspace.title}</span>
      </NavLink>
      <div className={styles.menuContainer} ref={menuRef}>
        <button
          className={styles.moreButton}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <MoreHorizontal size={14} />
        </button>
        {showMenu && (
          <div className={styles.dropdownMenu}>
            <button
              className={styles.menuItem}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite();
                setShowMenu(false);
              }}
            >
              <Star size={14} fill={workspace.isFavorite ? 'currentColor' : 'none'} />
              <span>{workspace.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</span>
            </button>
            <button
              className={`${styles.menuItem} ${styles.danger}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Delete this workspace? This cannot be undone.')) {
                  onDelete();
                }
                setShowMenu(false);
              }}
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

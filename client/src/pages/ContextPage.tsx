import { BookOpen, Plus, FileText, Database, Globe } from 'lucide-react';
import styles from './ContextPage.module.css';

export function ContextPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <BookOpen size={24} className={styles.headerIcon} />
          <div>
            <h1 className={styles.title}>Context</h1>
            <p className={styles.subtitle}>
              Manage knowledge sources and context that the agent can reference
            </p>
          </div>
        </div>
        <button className={styles.addButton}>
          <Plus size={18} />
          <span>Add Context</span>
        </button>
      </header>

      <div className={styles.content}>
        <div className={styles.emptyState}>
          <Database size={48} className={styles.emptyIcon} />
          <h3>No context sources</h3>
          <p>
            Add knowledge sources like documents, URLs, or databases for the agent
            to reference during conversations.
          </p>
        </div>
      </div>

      <div className={styles.contextTypes}>
        <h3>Available Context Types</h3>
        <div className={styles.typeGrid}>
          <div className={styles.typeCard}>
            <FileText size={24} className={styles.typeIcon} />
            <h4>Documents</h4>
            <p>Upload PDFs, markdown files, or text documents</p>
          </div>
          <div className={styles.typeCard}>
            <Globe size={24} className={styles.typeIcon} />
            <h4>URLs</h4>
            <p>Add web pages or documentation links to reference</p>
          </div>
          <div className={styles.typeCard}>
            <Database size={24} className={styles.typeIcon} />
            <h4>Data Sources</h4>
            <p>Connect to D1, KV, R2, or external databases</p>
          </div>
        </div>
      </div>

      <div className={styles.info}>
        <h3>About Context</h3>
        <p>
          Context sources provide the agent with domain-specific knowledge that it
          can use to answer questions and complete tasks more accurately. You can:
        </p>
        <ul>
          <li>Upload internal documentation or runbooks</li>
          <li>Connect to your Cloudflare D1, KV, or R2 storage</li>
          <li>Add URLs to external documentation</li>
          <li>Configure Vectorize for semantic search over large knowledge bases</li>
        </ul>
        <p>
          Context is scoped per workspace by default, but you can create global
          context sources that are available to all workspaces.
        </p>
      </div>
    </div>
  );
}

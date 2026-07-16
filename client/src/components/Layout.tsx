import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Theme } from '../App';
import styles from './Layout.module.css';

interface LayoutProps {
  children: ReactNode;
  theme: Theme;
  toggleTheme: () => void;
}

export function Layout({ children, theme, toggleTheme }: LayoutProps) {
  return (
    <div className={styles.layout}>
      <Sidebar theme={theme} toggleTheme={toggleTheme} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}

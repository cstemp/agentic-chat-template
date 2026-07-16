import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, Suspense } from 'react';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/LoadingSpinner';
import { HomePage } from './pages/HomePage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { SkillsPage } from './pages/SkillsPage';
import { ContextPage } from './pages/ContextPage';

export type Theme = 'dark' | 'light';

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as Theme) || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ErrorBoundary>
      <Layout theme={theme} toggleTheme={toggleTheme}>
        <Suspense fallback={<LoadingSpinner fullScreen message="Loading..." />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
            <Route path="/workspace/:id" element={<WorkspacePage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/context" element={<ContextPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </ErrorBoundary>
  );
}

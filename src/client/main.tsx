import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Layout } from './components/Layout.js';
import { Landing } from './pages/Landing.js';
import { Reception } from './pages/Reception.js';
import { Kitchen } from './pages/Kitchen.js';

export function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname || '/';
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string) => {
    if (to !== currentPath) {
      window.history.pushState({}, '', to);
      setCurrentPath(to);
      window.scrollTo(0, 0);
    }
  };

  const renderPage = () => {
    if (currentPath.startsWith('/reception')) {
      return <Reception />;
    }
    if (currentPath.startsWith('/kitchen')) {
      return <Kitchen />;
    }
    return <Landing onNavigate={navigate} />;
  };

  return (
    <Layout activePath={currentPath} onNavigate={navigate}>
      {renderPage()}
    </Layout>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

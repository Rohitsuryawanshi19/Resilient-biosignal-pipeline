import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Navbar } from './components/Navbar.js';
import { RouteSkeleton } from './components/RouteSkeleton.js';
import './styles/tokens.css';

// Lazy-loaded routes for code-splitting and performance
const Home = lazy(() => import('./pages/Home.js').then((m) => ({ default: m.Home })));
const Lab = lazy(() => import('./pages/Lab.js').then((m) => ({ default: m.Lab })));
const Proof = lazy(() => import('./pages/Proof.js').then((m) => ({ default: m.Proof })));
const Architecture = lazy(() => import('./pages/Architecture.js').then((m) => ({ default: m.Architecture })));
const Engineering = lazy(() => import('./pages/Engineering.js').then((m) => ({ default: m.Engineering })));
const About = lazy(() => import('./pages/About.js').then((m) => ({ default: m.About })));
const Styleguide = lazy(() => import('./pages/Styleguide.js').then((m) => ({ default: m.Styleguide })));
const NotFound = lazy(() => import('./pages/NotFound.js').then((m) => ({ default: m.NotFound })));

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const hash = window.location.hash.replace(/^#/, '');
    return hash || '/';
  });

  // Track online / offline state for PWA offline-first behavior
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      setCurrentPath(hash || '/');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // View Transitions API with graceful fallback
  const navigate = (path: string) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as any).startViewTransition(() => {
        window.location.hash = path;
        setCurrentPath(path);
        window.scrollTo({ top: 0 });
      });
    } else {
      window.location.hash = path;
      setCurrentPath(path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const getSourceBadge = (): 'LIVE' | 'SIMULATION' | 'RECORDED' => {
    if (currentPath === '/lab') return 'SIMULATION';
    if (currentPath === '/proof') return 'RECORDED';
    return 'LIVE';
  };

  const renderContent = () => {
    switch (currentPath) {
      case '/lab':
        return <Lab />;
      case '/proof':
        return <Proof />;
      case '/architecture':
        return <Architecture />;
      case '/engineering':
        return <Engineering />;
      case '/about':
        return <About />;
      case '/styleguide':
        return <Styleguide />;
      case '/':
        return <Home onNavigate={navigate} />;
      default:
        return <NotFound onNavigate={navigate} />;
    }
  };

  return (
    <div className="app-root">
      {/* Screen-reader route announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Navigated to {currentPath === '/' ? 'Home' : currentPath.slice(1)} page
      </div>

      {/* Offline PWA Status Banner */}
      {!isOnline && (
        <div className="offline-banner" role="alert" aria-live="assertive">
          <span className="offline-icon font-mono">⚡ OFFLINE MODE</span>
          <span>Service worker is serving cached app shell. Pipeline lab is running locally.</span>
        </div>
      )}

      {/* Aurora Background Mesh */}
      <div className="aurora-mesh" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      {/* Main Navbar */}
      <Navbar
        currentPath={currentPath}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={navigate}
        badge={getSourceBadge()}
      />

      {/* Page Content with Lazy Suspense */}
      <main className="app-main" id="main-content">
        <Suspense fallback={<RouteSkeleton />}>
          {renderContent()}
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <span>MayaCardio Systems Biosignal Pipeline</span>
          <span className="footer-divider">•</span>
          <a
            href="https://github.com/Rohitsuryawanshi19/Resilient-biosignal-pipeline"
            target="_blank"
            rel="noreferrer"
            className="footer-link"
          >
            GitHub
          </a>
          <span className="footer-divider">•</span>
          <button className="footer-link-btn" onClick={() => navigate('/about')}>
            AI Usage Disclosure
          </button>
          <span className="footer-divider">•</span>
          <button className="footer-link-btn" onClick={() => navigate('/styleguide')}>
            Design System Styleguide
          </button>
        </div>
      </footer>
    </div>
  );
};

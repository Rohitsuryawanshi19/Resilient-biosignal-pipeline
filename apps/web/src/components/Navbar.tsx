import React from 'react';
import { Button } from './Button.js';
import './Navbar.css';

export interface NavbarProps {
  currentPath: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  badge?: 'LIVE' | 'SIMULATION' | 'RECORDED';
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  theme,
  onToggleTheme,
  onNavigate,
  badge = 'LIVE',
}) => {
  const navItems = [
    { path: '/', label: 'Overview' },
    { path: '/lab', label: 'Pipeline Lab' },
    { path: '/proof', label: 'Proof & Invariants' },
    { path: '/architecture', label: 'Architecture' },
    { path: '/engineering', label: 'Engineering' },
    { path: '/about', label: 'About & AI' },
  ];

  return (
    <>
      <header className="neu-navbar">
        <div className="neu-navbar-inner">
          <div className="nav-left">
            <div className="brand" onClick={() => onNavigate('/')} role="button" tabIndex={0}>
              <span className="brand-dot" />
              <span className="brand-name">MayaCardio</span>
            </div>

            <div className={`source-badge badge-${badge.toLowerCase()}`}>
              <span className="badge-pulse" />
              <span>{badge}</span>
            </div>
          </div>

          <nav className="nav-center desktop-only" aria-label="Main Navigation">
            {navItems.map((item) => (
              <button
                key={item.path}
                className={`nav-link ${currentPath === item.path ? 'nav-link-active' : ''}`}
                onClick={() => onNavigate(item.path)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="nav-right">
            <Button variant="raised" size="sm" onClick={onToggleTheme}>
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </Button>
            <Button
              variant="accent-online"
              size="sm"
              onClick={() => onNavigate('/lab')}
              className="desktop-only"
            >
              Launch Lab &rarr;
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Tab Bar */}
      <nav className="mobile-tab-bar" aria-label="Mobile Navigation">
        {navItems.map((item) => (
          <button
            key={item.path}
            className={`mobile-tab-item ${currentPath === item.path ? 'tab-active' : ''}`}
            onClick={() => onNavigate(item.path)}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
};

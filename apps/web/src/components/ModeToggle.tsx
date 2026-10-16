import React from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './ModeToggle.css';

export interface ModeToggleProps {
  mode: 'online' | 'offline';
  onChange: (mode: 'online' | 'offline') => void;
  disabled?: boolean;
  label?: string;
  forceState?: 'default' | 'hover' | 'focus';
}

export const ModeToggle: React.FC<ModeToggleProps> = ({
  mode,
  onChange,
  disabled = false,
  label = 'Pipeline Operation Mode',
  forceState,
}) => {
  const isOnline = mode === 'online';
  const reducedMotion = useReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(isOnline ? 'offline' : 'online');
    }
  };

  const handleToggle = () => {
    if (!disabled) {
      onChange(isOnline ? 'offline' : 'online');
    }
  };

  return (
    <div className={`neu-mode-toggle-wrapper ${forceState ? `force-${forceState}` : ''}`}>
      <div
        className={`neu-mode-toggle-track ${isOnline ? 'track-online' : 'track-offline'} ${
          disabled ? 'track-disabled' : ''
        }`}
        role="switch"
        aria-checked={isOnline}
        aria-disabled={disabled}
        aria-label={`${label}: currently ${mode}`}
        tabIndex={disabled ? -1 : 0}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        <span className={`toggle-label-pill offline-pill ${!isOnline ? 'active-pill' : ''}`}>
          OFFLINE
        </span>
        <span className={`toggle-label-pill online-pill ${isOnline ? 'active-pill' : ''}`}>
          ONLINE
        </span>

        <motion.div
          className="neu-mode-toggle-thumb"
          layout
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 500, damping: 32 }
          }
          style={{
            x: isOnline ? 82 : 4,
          }}
          animate={{
            backgroundColor: isOnline ? 'var(--accent-online)' : 'var(--accent-offline)',
            boxShadow: isOnline
              ? '0 0 16px var(--accent-online-glow), 2px 2px 6px rgba(0,0,0,0.45)'
              : '0 0 16px var(--accent-offline-glow), 2px 2px 6px rgba(0,0,0,0.45)',
          }}
        >
          <span className="thumb-status-dot" />
        </motion.div>
      </div>

      <div className="sr-only" aria-live="polite">
        {mode} mode active
      </div>
    </div>
  );
};

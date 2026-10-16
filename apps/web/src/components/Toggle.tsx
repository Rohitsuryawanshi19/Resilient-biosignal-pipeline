import React from 'react';
import { motion } from 'motion/react';
import './Toggle.css';

export interface ToggleProps {
  checked: boolean; // true = online, false = offline
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  label = 'System Mode',
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div className="neu-toggle-wrapper">
      <div
        className={`neu-toggle-track ${checked ? 'track-online' : 'track-offline'} ${
          disabled ? 'track-disabled' : ''
        }`}
        role="switch"
        aria-checked={checked}
        aria-label={`${label}: currently ${checked ? 'online' : 'offline'}`}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={handleKeyDown}
      >
        <span className="toggle-label left-label">OFFLINE</span>
        <span className="toggle-label right-label">ONLINE</span>

        <motion.div
          className="neu-toggle-thumb"
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            x: checked ? 78 : 4,
          }}
          animate={{
            backgroundColor: checked ? 'var(--accent-online)' : 'var(--accent-offline)',
            boxShadow: checked
              ? '0 0 16px var(--accent-online-glow), 2px 2px 6px rgba(0,0,0,0.4)'
              : '0 0 16px var(--accent-offline-glow), 2px 2px 6px rgba(0,0,0,0.4)',
          }}
        >
          <span className="thumb-indicator" />
        </motion.div>
      </div>
      <div className="sr-only" aria-live="polite">
        Mode changed to {checked ? 'online' : 'offline'}
      </div>
    </div>
  );
};

import React from 'react';
import './Badge.css';

export type BadgeType = 'live' | 'simulation' | 'recorded';

export interface BadgeProps {
  type: BadgeType;
  label?: string;
  detail?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  type,
  label,
  detail,
  className = '',
  size = 'md',
}) => {
  const defaultLabels: Record<BadgeType, string> = {
    live: 'LIVE',
    simulation: 'SIMULATION',
    recorded: 'RECORDED',
  };

  const displayLabel = label || defaultLabels[type];

  const renderIcon = () => {
    switch (type) {
      case 'live':
        return (
          <span className="neu-badge-icon live-pulse" aria-hidden="true">
            <span className="live-dot" />
            <span className="live-ping" />
          </span>
        );
      case 'simulation':
        return (
          <svg
            className="neu-badge-icon sim-flask"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 2v7.31L4.36 18.6A2 2 0 0 0 6 21.6h12a2 2 0 0 0 1.64-3L14 9.31V2" />
            <path d="M8.5 2h7" />
            <path d="M7 16h10" />
          </svg>
        );
      case 'recorded':
        return (
          <svg
            className="neu-badge-icon rec-disk"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        );
    }
  };

  return (
    <span
      className={`neu-badge neu-badge-${type} neu-badge-${size} ${className}`}
      role="status"
      aria-label={`Data source: ${displayLabel}${detail ? ` (${detail})` : ''}`}
    >
      {renderIcon()}
      <span className="neu-badge-label font-mono">{displayLabel}</span>
      {detail && <span className="neu-badge-detail">{detail}</span>}
    </span>
  );
};

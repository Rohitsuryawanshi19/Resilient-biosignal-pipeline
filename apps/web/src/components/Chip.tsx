import React from 'react';
import './Chip.css';

export interface ChipProps {
  label: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'default' | 'online' | 'offline' | 'loss' | 'sync';
  size?: 'sm' | 'md';
  onRemove?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  forceState?: 'default' | 'hover' | 'focus';
  'data-testid'?: string;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  icon,
  variant = 'default',
  size = 'md',
  onRemove,
  onClick,
  disabled = false,
  className = '',
  forceState,
  'data-testid': dataTestId,
}) => {
  const isInteractive = Boolean(onClick && !disabled);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.();
    } else if (onRemove && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      onRemove();
    }
  };

  return (
    <div
      className={`neu-chip neu-chip-${variant} neu-chip-${size} ${
        isInteractive ? 'is-interactive' : ''
      } ${disabled ? 'is-disabled' : ''} ${forceState ? `force-${forceState}` : ''} ${className}`}
      role={isInteractive ? 'button' : 'status'}
      data-testid={dataTestId}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      aria-disabled={disabled}
    >
      {icon && <span className="neu-chip-icon" aria-hidden="true">{icon}</span>}
      <span className="neu-chip-label">{label}</span>
      {onRemove && !disabled && (
        <button
          type="button"
          className="neu-chip-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove item"
        >
          ×
        </button>
      )}
    </div>
  );
};

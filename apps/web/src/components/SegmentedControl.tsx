import React from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './SegmentedControl.css';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  forceState?: 'default' | 'hover' | 'focus';
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  forceState,
}: SegmentedControlProps<T>) {
  const reducedMotion = useReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (disabled) return;
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + options.length) % options.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = options.length - 1;
    }
    const targetOpt = options[nextIndex];
    if (targetOpt && !targetOpt.disabled) {
      onChange(targetOpt.value);
    }
  };

  return (
    <div
      className={`neu-segmented-control neu-segmented-${size} ${
        disabled ? 'neu-segmented-disabled' : ''
      } ${forceState ? `force-${forceState}` : ''} ${className}`}
      role="radiogroup"
      aria-disabled={disabled}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        const optDisabled = disabled || opt.disabled;

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={optDisabled}
            tabIndex={isSelected ? 0 : -1}
            className={`neu-segmented-btn ${isSelected ? 'is-selected' : ''} ${
              optDisabled ? 'is-disabled' : ''
            }`}
            onClick={() => !optDisabled && onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            {isSelected && (
              <motion.div
                layoutId="segmented-active-pill"
                className="neu-segmented-pill"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 450, damping: 32 }
                }
              />
            )}
            <span className="neu-segmented-content">
              {opt.icon && <span className="neu-segmented-icon" aria-hidden="true">{opt.icon}</span>}
              <span className="neu-segmented-label">{opt.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

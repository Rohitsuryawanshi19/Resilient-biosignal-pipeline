import React, { useRef, useState } from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './Button.css';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'raised' | 'pressed' | 'accent-online' | 'accent-sync' | 'accent-loss';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  icon?: React.ReactNode;
  magnetic?: boolean;
  loading?: boolean;
  error?: boolean;
  disabled?: boolean;
  forceState?: 'default' | 'hover' | 'pressed' | 'focus';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  icon,
  magnetic = false,
  loading = false,
  error = false,
  disabled = false,
  forceState,
  className = '',
  onClick,
  ...props
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const reducedMotion = useReducedMotion();

  // Normalize variants: primary = sync, secondary = raised, danger = loss
  const resolvedVariant =
    variant === 'primary' ? 'accent-sync' :
    variant === 'secondary' ? 'raised' :
    variant === 'danger' ? 'accent-loss' :
    variant;

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!magnetic || reducedMotion || disabled || loading || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setOffset({
      x: (e.clientX - cx) * 0.15,
      y: (e.clientY - cy) * 0.15,
    });
  };

  const handleMouseLeave = () => {
    if (magnetic && !reducedMotion) setOffset({ x: 0, y: 0 });
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) {
      e.preventDefault();
      return;
    }
    if (!reducedMotion && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setRipple({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setTimeout(() => setRipple(null), 500);
    }
    if (onClick) onClick(e);
  };

  return (
    <motion.button
      ref={btnRef}
      className={`neu-btn neu-btn-${resolvedVariant} neu-btn-${size} ${
        disabled ? 'neu-btn-disabled' : ''
      } ${loading ? 'neu-btn-loading' : ''} ${error ? 'neu-btn-error' : ''} ${
        forceState ? `force-${forceState}` : ''
      } ${className}`}
      animate={reducedMotion ? {} : { x: offset.x, y: offset.y }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      whileTap={reducedMotion || disabled || loading ? {} : { scale: 0.97, y: 2 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="neu-btn-spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="neu-btn-icon" aria-hidden="true">{icon}</span>
      ) : null}

      <span className="neu-btn-text">{children}</span>

      {ripple && (
        <span
          className="neu-btn-ripple"
          style={{ left: ripple.x, top: ripple.y }}
          aria-hidden="true"
        />
      )}
    </motion.button>
  );
};

import React from 'react';
import { motion } from 'motion/react';
import { useTilt } from '../hooks/useTilt.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './Card.css';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  enableTilt?: boolean;
  glowColor?: 'mint' | 'amber' | 'coral' | 'blue' | 'none';
  header?: React.ReactNode;
  action?: React.ReactNode;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  enableTilt = true,
  glowColor = 'none',
  header,
  action,
  onClick,
}) => {
  const reducedMotion = useReducedMotion();
  const { ref, isHovered, tiltStyle, onMouseMove, onMouseEnter, onMouseLeave } = useTilt<HTMLDivElement>({
    disabled: !enableTilt,
    maxTiltDeg: 6,
  });

  return (
    <motion.div
      ref={ref}
      className={`neu-card glow-${glowColor} ${isHovered ? 'neu-card-hover' : ''} ${className}`}
      style={tiltStyle}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      whileHover={reducedMotion ? {} : { y: -4, transition: { duration: 0.2 } }}
      onClick={onClick}
    >
      <div className="neu-card-inner">
        {(header || action) && (
          <div className="neu-card-header">
            {header && <div className="neu-card-title">{header}</div>}
            {action && <div className="neu-card-action">{action}</div>}
          </div>
        )}
        <div className="neu-card-content">{children}</div>
      </div>
    </motion.div>
  );
};

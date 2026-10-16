import React from 'react';
import './FocusRing.css';

export interface FocusRingProps {
  children: React.ReactElement;
  className?: string;
  variant?: 'sync' | 'mint' | 'amber';
}

export const FocusRing: React.FC<FocusRingProps> = ({
  children,
  className = '',
  variant = 'sync',
}) => {
  return React.cloneElement(children, {
    className: `${children.props.className || ''} neu-focus-ring neu-focus-${variant} ${className}`.trim(),
  });
};

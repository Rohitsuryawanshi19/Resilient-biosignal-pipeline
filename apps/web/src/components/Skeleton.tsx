import React from 'react';
import './Skeleton.css';

export interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  borderRadius,
  className = '',
}) => {
  const inlineStyle: React.CSSProperties = {
    width: width !== undefined ? width : undefined,
    height: height !== undefined ? height : undefined,
    borderRadius: borderRadius !== undefined ? borderRadius : undefined,
  };

  return (
    <div
      className={`neu-skeleton neu-skeleton-${variant} ${className}`}
      style={inlineStyle}
      aria-hidden="true"
    />
  );
};

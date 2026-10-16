import React, { useEffect, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './StatTile.css';

export interface StatTileProps {
  label: string;
  value: number;
  unit?: string;
  delta?: {
    value: number;
    unit?: string;
    isPositiveGood?: boolean; // whether positive delta is green or red
  };
  subtext?: string;
  color?: 'mint' | 'amber' | 'coral' | 'blue';
  decimals?: number;
  className?: string;
  'data-testid'?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  unit,
  delta,
  subtext,
  color = 'mint',
  decimals = 0,
  className = '',
  'data-testid': dataTestId,
}) => {
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(value);
      return;
    }
    const start = displayValue;
    const end = value;
    const duration = 600;
    const startTime = performance.now();

    let frameId: number;
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(start + (end - start) * ease);
      if (progress < 1) {
        frameId = requestAnimationFrame(update);
      }
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [value, reducedMotion]);

  const formattedValue =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : Math.round(displayValue).toLocaleString();

  const isPositive = delta ? delta.value >= 0 : false;
  const isGood =
    delta && delta.isPositiveGood !== undefined
      ? isPositive === delta.isPositiveGood
      : isPositive;

  return (
    <div className={`neu-stat-tile neu-stat-${color} ${className}`} data-testid={dataTestId}>
      <div className="stat-tile-header">
        <span className="stat-tile-label">{label}</span>
        {delta && (
          <span
            className={`stat-tile-delta ${isGood ? 'delta-good' : 'delta-bad'}`}
            aria-label={`Change: ${isPositive ? '+' : ''}${delta.value}${delta.unit || ''}`}
          >
            {isPositive ? '↑' : '↓'} {Math.abs(delta.value)}
            {delta.unit || '%'}
          </span>
        )}
      </div>

      <div className="stat-tile-main">
        <span className="stat-tile-value font-mono">{formattedValue}</span>
        {unit && <span className="stat-tile-unit font-mono">{unit}</span>}
      </div>

      {subtext && <div className="stat-tile-subtext">{subtext}</div>}
    </div>
  );
};

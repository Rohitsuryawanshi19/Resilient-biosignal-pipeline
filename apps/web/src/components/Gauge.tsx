import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './Gauge.css';

export interface GaugeProps {
  label: string;
  value: number;
  max?: number;
  min?: number;
  unit?: string;
  color?: 'mint' | 'amber' | 'coral' | 'blue';
  sparklineData?: number[];
  size?: number;
  subtext?: string;
  showNeedle?: boolean;
}

export const Gauge: React.FC<GaugeProps> = ({
  label,
  value,
  max = 100,
  min = 0,
  unit = '%',
  color = 'mint',
  sparklineData,
  size = 140,
  subtext,
  showNeedle = true,
}) => {
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);

  // Animated count-up
  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(value);
      return;
    }
    const start = displayValue;
    const end = value;
    const duration = 600; // ms
    const startTime = performance.now();

    let frameId: number;
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(start + (end - start) * ease);
      if (progress < 1) {
        frameId = requestAnimationFrame(update);
      }
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [value, reducedMotion]);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const radius = (size - 28) / 2;
  const circumference = 2 * Math.PI * radius;
  // 240 degree gauge sweep
  const arcSweep = 240;
  const arcLength = (circumference * arcSweep) / 360;
  const strokeDashoffset = arcLength - (percentage / 100) * arcLength;

  // Needle angle (-120deg to +120deg)
  const needleAngle = -120 + (percentage / 100) * 240;

  const colorVarMap = {
    mint: 'var(--accent-online)',
    amber: 'var(--accent-offline)',
    coral: 'var(--accent-loss)',
    blue: 'var(--accent-sync)',
  };

  const colorTextVarMap = {
    mint: 'var(--accent-online-text)',
    amber: 'var(--accent-offline-text)',
    coral: 'var(--accent-loss-text)',
    blue: 'var(--accent-sync-text)',
  };

  const currentColor = colorVarMap[color];
  const currentTextColor = colorTextVarMap[color];

  return (
    <div
      className="neu-gauge-container"
      style={{ width: size }}
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
    >
      <div className="neu-gauge-dial" style={{ width: size, height: size }}>
        <svg
          className="neu-gauge-svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="gauge-track"
            strokeWidth="8"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset="0"
            transform={`rotate(150 ${size / 2} ${size / 2})`}
          />
          {/* Active Value Arc */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="gauge-indicator"
            stroke={currentColor}
            strokeWidth="8"
            strokeDasharray={`${arcLength} ${circumference}`}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 120, damping: 20 }
            }
            transform={`rotate(150 ${size / 2} ${size / 2})`}
            strokeLinecap="round"
          />
        </svg>

        {/* Animated Needle */}
        {showNeedle && (
          <motion.div
            className="neu-gauge-needle"
            style={{
              width: size,
              height: size,
            }}
            initial={{ rotate: -120 }}
            animate={{ rotate: needleAngle }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 140, damping: 18 }
            }
          >
            <div className="needle-pin" style={{ backgroundColor: currentColor }} />
          </motion.div>
        )}

        {/* Center Knob with Inset Shadow */}
        <div className="neu-gauge-center">
          <div className="gauge-value font-mono" style={{ color: currentTextColor }}>
            {Number.isInteger(value) ? Math.round(displayValue) : displayValue.toFixed(1)}
            <span className="gauge-unit">{unit}</span>
          </div>
          {subtext && <div className="gauge-subtext">{subtext}</div>}
        </div>
      </div>

      <div className="gauge-label">{label}</div>

      {sparklineData && sparklineData.length > 1 && (
        <div className="gauge-sparkline" aria-hidden="true">
          <svg viewBox="0 0 100 24" className="sparkline-svg" preserveAspectRatio="none">
            {(() => {
              const minVal = Math.min(...sparklineData);
              const maxVal = Math.max(...sparklineData, minVal + 1);
              const pts = sparklineData
                .map((val, idx) => {
                  const x = (idx / (sparklineData.length - 1)) * 100;
                  const y = 24 - ((val - minVal) / (maxVal - minVal)) * 20 - 2;
                  return `${x},${y}`;
                })
                .join(' ');
              return (
                <polyline
                  fill="none"
                  stroke={currentColor}
                  strokeWidth="2"
                  points={pts}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })()}
          </svg>
        </div>
      )}
    </div>
  );
};

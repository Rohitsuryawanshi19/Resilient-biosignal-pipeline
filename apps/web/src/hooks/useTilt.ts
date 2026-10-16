import { useRef, useState, useMemo } from 'react';
import { useMotionValue, useSpring, useTransform } from 'motion/react';
import { useReducedMotion } from './useReducedMotion.js';

export interface UseTiltOptions {
  maxTiltDeg?: number;
  disabled?: boolean;
}

export function useTilt<T extends HTMLElement = HTMLDivElement>(options: UseTiltOptions = {}) {
  const { maxTiltDeg = 6, disabled = false } = options;
  const ref = useRef<T | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  const isTouchDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);

  const effectiveDisabled = disabled || reducedMotion || isTouchDevice;

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springX = useSpring(x, { stiffness: 350, damping: 28 });
  const springY = useSpring(y, { stiffness: 350, damping: 28 });

  const rotateX = useTransform(springY, [-0.5, 0.5], [`${maxTiltDeg}deg`, `-${maxTiltDeg}deg`]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [`-${maxTiltDeg}deg`, `${maxTiltDeg}deg`]);

  const onMouseMove = (e: React.MouseEvent<T>) => {
    if (effectiveDisabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width - 0.5;
    const yPct = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const onMouseEnter = () => {
    if (!effectiveDisabled) setIsHovered(true);
  };

  const onMouseLeave = () => {
    if (!effectiveDisabled) {
      setIsHovered(false);
      x.set(0);
      y.set(0);
    }
  };

  return {
    ref,
    isHovered,
    tiltStyle: effectiveDisabled
      ? {}
      : {
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d' as const,
        },
    onMouseMove,
    onMouseEnter,
    onMouseLeave,
    disabled: effectiveDisabled,
  };
}

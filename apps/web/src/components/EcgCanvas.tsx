import React, { useRef, useEffect } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './EcgCanvas.css';

export interface EcgCanvasProps {
  bpm: number | null;
  peaksCount?: number;
  mode?: 'online' | 'offline';
  samplesTicking?: number;
}

export const EcgCanvas: React.FC<EcgCanvasProps> = ({
  bpm = 72,
  peaksCount = 12,
  mode = 'online',
  samplesTicking = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 600;
    let height = 200;
    let gridCanvas: HTMLCanvasElement | null = null;

    // Create / update cached grid pattern to avoid 50+ line strokes per frame
    const updateGridCache = (w: number, h: number) => {
      gridCanvas = document.createElement('canvas');
      gridCanvas.width = w;
      gridCanvas.height = h;
      const gCtx = gridCanvas.getContext('2d');
      if (!gCtx) return;

      gCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      gCtx.lineWidth = 1;
      const gridSize = 25;
      for (let x = 0; x < w; x += gridSize) {
        gCtx.beginPath();
        gCtx.moveTo(x, 0);
        gCtx.lineTo(x, h);
        gCtx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        gCtx.beginPath();
        gCtx.moveTo(0, y);
        gCtx.lineTo(w, y);
        gCtx.stroke();
      }
    };

    const updateSize = () => {
      const parent = canvas.parentElement;
      const newWidth = parent?.clientWidth || 600;
      const newHeight = 200;
      width = newWidth;
      height = newHeight;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.resetTransform?.();
      ctx.scale(dpr, dpr);
      updateGridCache(width, height);
    };

    updateSize();

    // ResizeObserver prevents layout thrashing
    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    let offset = 0;
    const points: Array<{ x: number; y: number; isPeak?: boolean }> = [];
    const maxPoints = Math.max(50, Math.floor(width / 2));

    const render = () => {
      // Skip render when tab is in background to save battery & CPU
      if (document.hidden) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Blit cached grid pattern (1 GPU draw call)
      if (gridCanvas) {
        ctx.drawImage(gridCanvas, 0, 0);
      }

      // Generate next sample
      offset += reducedMotion ? 0.5 : 1.5;
      const phase = offset % 140; // synthetic heartbeat period
      let y = height / 2;
      let isPeak = false;

      // P wave
      if (phase > 20 && phase < 40) {
        y -= Math.sin(((phase - 20) / 20) * Math.PI) * 12;
      }
      // QRS complex
      else if (phase >= 55 && phase <= 60) {
        y += 8; // Q
      } else if (phase > 60 && phase <= 70) {
        const qrsDist = Math.abs(phase - 65);
        y -= (1 - qrsDist / 5) * 65; // R peak
        if (phase >= 64 && phase <= 66) isPeak = true;
      } else if (phase > 70 && phase <= 75) {
        y += 14; // S
      }
      // T wave
      else if (phase > 90 && phase < 120) {
        y -= Math.sin(((phase - 90) / 30) * Math.PI) * 18;
      }

      // Add slight noise
      y += (Math.random() - 0.5) * 2;

      points.push({ x: width, y, isPeak });
      if (points.length > maxPoints) points.shift();

      // Shift existing points left
      const len = points.length;
      for (let i = 0; i < len; i++) {
        points[i]!.x = (i / maxPoints) * width;
      }

      // Draw ECG Path
      if (len > 1) {
        ctx.beginPath();
        ctx.strokeStyle = mode === 'online' ? '#3dffb5' : '#ffb454';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = mode === 'online' ? 'rgba(61, 255, 181, 0.5)' : 'rgba(255, 180, 84, 0.5)';
        ctx.shadowBlur = 8;
        ctx.moveTo(points[0]!.x, points[0]!.y);
        for (let i = 1; i < len; i++) {
          ctx.lineTo(points[i]!.x, points[i]!.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw Peak Glowing Dots
        for (let i = 0; i < len; i++) {
          const p = points[i]!;
          if (p.isPeak) {
            ctx.beginPath();
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#3dffb5';
            ctx.shadowBlur = 10;
            ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      resizeObserver.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [mode, reducedMotion]);

  return (
    <div className="ecg-panel-wrapper">
      <div className="ecg-top-bar">
        <div className="ecg-title-group">
          <span className="ecg-live-dot" />
          <span className="ecg-title">Sensor 1 (Lead II) — 400 Hz Real-Time Waveform</span>
        </div>
        <div className="bpm-readout">
          <span className="bpm-number font-mono">{bpm ?? '--'}</span>
          <span className="bpm-unit">BPM</span>
        </div>
      </div>

      <div className="canvas-container">
        <canvas ref={canvasRef} className="ecg-canvas" />
      </div>

      <div className="ecg-footer-chips">
        <span className="footer-chip chip-peaks">
          <span className="chip-bullet" />
          <span>{peaksCount} Peaks Detected (Greedy Lookback)</span>
        </span>
        <span className="footer-chip chip-samples">
          <span className="chip-bullet" />
          <span className="font-mono">{samplesTicking} samples buffered</span>
        </span>
        <span className={`footer-chip chip-mode chip-mode-${mode}`}>
          <span className="chip-bullet" />
          <span>Mode: {mode.toUpperCase()}</span>
        </span>
      </div>
    </div>
  );
};

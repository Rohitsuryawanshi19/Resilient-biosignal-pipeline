import React from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './AuroraBackground.css';

export const AuroraBackground: React.FC = () => {
  const reducedMotion = useReducedMotion();

  return (
    <div className={`aurora-mesh ${reducedMotion ? 'aurora-static' : ''}`} aria-hidden="true">
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
    </div>
  );
};

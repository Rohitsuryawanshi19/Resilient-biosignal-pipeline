import React, { useState } from 'react';
import { motion } from 'motion/react';
import './Tile.css';

export type TileStatus = 'stored' | 'lost' | 'pending-sync' | 'empty';

export interface TileProps {
  status: TileStatus;
  sensor?: 1 | 2;
  fromIndex?: number;
  toIndex?: number;
  reason?: string;
  count?: number;
  onClick?: () => void;
}

export const Tile: React.FC<TileProps> = ({
  status,
  sensor = 1,
  fromIndex = 0,
  toIndex = 0,
  reason,
  count = 1,
  onClick,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const statusColorMap: Record<TileStatus, string> = {
    stored: 'var(--accent-online)',
    lost: 'var(--accent-loss)',
    'pending-sync': 'var(--accent-sync)',
    empty: 'var(--surface-border)',
  };

  const statusGlowMap: Record<TileStatus, string> = {
    stored: 'var(--accent-online-glow)',
    lost: 'var(--accent-loss-glow)',
    'pending-sync': 'var(--accent-sync-glow)',
    empty: 'transparent',
  };

  return (
    <div
      className="neu-tile-wrapper"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={onClick}
    >
      <motion.div
        className={`neu-tile neu-tile-${status}`}
        layout
        initial={{ scale: 0.9, opacity: 0.8 }}
        animate={{
          scale: 1,
          opacity: 1,
          backgroundColor: statusColorMap[status],
          boxShadow: showTooltip ? `0 0 12px ${statusGlowMap[status]}` : 'none',
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        whileHover={{ scale: 1.15, zIndex: 10 }}
      />

      {showTooltip && (
        <motion.div
          className="neu-tile-tooltip"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <div className="tooltip-header">
            <span className={`status-badge badge-${status}`}>
              {status.toUpperCase()}
            </span>
            <span className="sensor-tag">S{sensor}</span>
          </div>
          <div className="tooltip-body">
            <div>
              <span className="tooltip-label">Range:</span>{' '}
              <span className="tooltip-val font-mono">[{fromIndex}, {toIndex})</span>
            </div>
            <div>
              <span className="tooltip-label">Samples:</span>{' '}
              <span className="tooltip-val font-mono">{count}</span>
            </div>
            {reason && (
              <div>
                <span className="tooltip-label">Reason:</span>{' '}
                <span className="tooltip-val tooltip-reason">{reason}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

import React from 'react';
import './TimelineItem.css';

export type TimelineStatus = 'online' | 'offline' | 'loss' | 'sync' | 'neutral';

export interface TimelineItemProps {
  title: React.ReactNode;
  timestamp: string;
  description?: React.ReactNode;
  status?: TimelineStatus;
  isLast?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const TimelineItem: React.FC<TimelineItemProps> = ({
  title,
  timestamp,
  description,
  status = 'neutral',
  isLast = false,
  icon,
  className = '',
}) => {
  return (
    <div className={`neu-timeline-item neu-timeline-${status} ${className}`} role="listitem">
      <div className="timeline-node-col">
        <div className="timeline-node">
          {icon ? (
            <span className="timeline-node-icon">{icon}</span>
          ) : (
            <span className="timeline-node-dot" />
          )}
        </div>
        {!isLast && <div className="timeline-connector" />}
      </div>

      <div className="timeline-content-col">
        <div className="timeline-header">
          <span className="timeline-title">{title}</span>
          <time className="timeline-time font-mono">{timestamp}</time>
        </div>
        {description && <div className="timeline-desc">{description}</div>}
      </div>
    </div>
  );
};

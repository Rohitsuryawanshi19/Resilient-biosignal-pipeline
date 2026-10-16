import React from 'react';
import { Skeleton } from './Skeleton.js';
import './Skeleton.css';

export const RouteSkeleton: React.FC = () => {
  return (
    <div className="route-skeleton-container" style={{ padding: '32px 16px', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Skeleton variant="rectangular" width="220px" height="28px" borderRadius="14px" />
        <Skeleton variant="text" width="60%" height="42px" />
        <Skeleton variant="text" width="85%" height="20px" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <Skeleton variant="rectangular" height="180px" borderRadius="16px" />
        <Skeleton variant="rectangular" height="180px" borderRadius="16px" />
        <Skeleton variant="rectangular" height="180px" borderRadius="16px" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Skeleton variant="rectangular" height="120px" borderRadius="16px" />
        <Skeleton variant="rectangular" height="120px" borderRadius="16px" />
      </div>
    </div>
  );
};

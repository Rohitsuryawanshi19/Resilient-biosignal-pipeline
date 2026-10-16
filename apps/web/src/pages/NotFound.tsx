import React from 'react';
import { Card } from '../components/Card.js';
import { Button } from '../components/Button.js';
import './NotFound.css';

export interface NotFoundProps {
  onNavigate: (path: string) => void;
}

export const NotFound: React.FC<NotFoundProps> = ({ onNavigate }) => {
  return (
    <div className="not-found-container">
      <Card header="404 — Route Not Found" glowColor="coral">
        <div className="not-found-content">
          <span className="not-found-code font-mono">404</span>
          <h2 className="not-found-title">Uncharted Route</h2>
          <p className="not-found-desc">
            The requested pipeline URL does not correspond to a valid route. All pipeline states and telemetry
            routes are strictly accounted for in the system ledger.
          </p>
          <div className="not-found-actions">
            <Button
              variant="accent-online"
              size="md"
              onClick={() => onNavigate('/')}
            >
              &larr; Return to Dashboard
            </Button>
            <Button
              variant="raised"
              size="md"
              onClick={() => onNavigate('/lab')}
            >
              Open Pipeline Lab
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

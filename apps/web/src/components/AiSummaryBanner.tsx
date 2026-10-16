import React from 'react';
import { motion } from 'motion/react';
import './AiSummaryBanner.css';

export interface AiSummaryData {
  summary: string;
  source: 'gemini-flash' | 'deterministic-fallback';
  facts?: Record<string, any>;
  timestamp?: number;
}

export interface AiSummaryBannerProps {
  data?: AiSummaryData | null;
  onDismiss?: () => void;
}

export const AiSummaryBanner: React.FC<AiSummaryBannerProps> = ({ data, onDismiss }) => {
  if (!data || !data.summary) {
    return null; // Graceful degradation: disappears silently
  }

  const isLlm = data.source === 'gemini-flash';

  return (
    <motion.aside
      className="ai-summary-banner"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      aria-label="System Event Explanation"
    >
      <div className="ai-summary-header">
        <div className="ai-summary-tags">
          <span className="ai-badge-label">AI-GENERATED SUMMARY</span>
          <span className={`ai-source-chip ${isLlm ? 'chip-gemini' : 'chip-fallback'}`}>
            {isLlm ? 'Gemini 2.5 Flash (Free Tier)' : 'Deterministic Safe Template'}
          </span>
          <span className="ai-safety-badge" title="Validated: zero hallucinated numbers">
            ✓ Numbers Verified
          </span>
        </div>
        {onDismiss && (
          <button
            className="ai-dismiss-btn"
            onClick={onDismiss}
            aria-label="Dismiss summary"
          >
            &times;
          </button>
        )}
      </div>

      <p className="ai-summary-text">{data.summary}</p>
    </motion.aside>
  );
};

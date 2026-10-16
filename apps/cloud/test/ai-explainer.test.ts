import { describe, test, expect } from 'bun:test';
import { AiExplainer, type LossFacts, type ModeFacts } from '../src/ai-explainer.js';

describe('AiExplainer Unit Tests (Gemini Free Tier Off-Path)', () => {
  test('1. Deterministic fallback generates valid 2-sentence explanation', () => {
    const explainer = new AiExplainer();
    const facts: LossFacts = {
      type: 'loss',
      sensor: 1,
      from: 1200,
      to: 1600,
      count: 400,
      reason: 'crc_mismatch_unrecoverable',
    };

    const text = explainer.getDeterministicTemplate(facts);
    expect(text).toContain('Sensor 1');
    expect(text).toContain('1200 to 1600');
    expect(text).toContain('crc_mismatch_unrecoverable');
    expect(explainer.validateNumbers(text, facts)).toBe(true);
  });

  test('2. Number validation passes when output contains only authorized input numbers', () => {
    const explainer = new AiExplainer();
    const facts: LossFacts = {
      type: 'loss',
      sensor: 1,
      from: 100,
      to: 200,
      count: 100,
      reason: 'sensor_timeout',
    };

    const safeText = 'Sensor 1 missed 100 samples from 100 to 200 due to a timeout. The ledger recorded the loss.';
    expect(explainer.validateNumbers(safeText, facts)).toBe(true);
  });

  test('3. Number validation strictly catches and rejects hallucinated numbers', () => {
    const explainer = new AiExplainer();
    const facts: LossFacts = {
      type: 'loss',
      sensor: 2,
      from: 0,
      to: 400,
      count: 400,
      reason: 'power_cut_unread',
    };

    // Text contains hallucinated "99" and "50" not present in facts
    const hallucinatedText = 'Sensor 2 dropped 400 samples with 99 percent probability after 50 milliseconds.';
    expect(explainer.validateNumbers(hallucinatedText, facts)).toBe(false);
  });

  test('4. Graceful degradation without API key returns deterministic fallback', async () => {
    const explainer = new AiExplainer(undefined);
    const modeFacts: ModeFacts = {
      type: 'mode',
      fromMode: 'online',
      toMode: 'offline',
      reason: 'missed_acks_timeout',
    };

    const res = await explainer.explain(modeFacts);
    expect(res.source).toBe('deterministic-fallback');
    expect(res.summary).toContain('online to offline');
    expect(res.summary).toContain('missed_acks_timeout');
  });
});

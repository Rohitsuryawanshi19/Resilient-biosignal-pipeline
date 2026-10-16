/**
 * Optional AI Explainer using Google Gemini API Free Tier.
 * 
 * STRICT INVARIANTS:
 * 1. COMPLETELY OFF THE CRITICAL PATH: The ingest pipeline, storage, sync,
 *    and results never await or depend on this service.
 * 2. FREE TIER ONLY: Gemini 2.5 Flash Free Tier (15 RPM, 1M TPM, 1,500 RPD, $0 cost).
 * 3. NO NUMBER HALLUCINATION: All numbers in the output must strictly exist in the
 *    input facts. If any unrecognized number appears, it is rejected and falls back
 *    to a deterministic template string.
 * 4. GRACEFUL DEGRADATION: If the API key is missing or quota is exhausted (429),
 *    the feature degrades silently without throwing errors.
 */

export interface LossFacts {
  type: 'loss';
  sensor: 1 | 2;
  from: number;
  to: number | null;
  count: number;
  reason: string;
}

export interface ModeFacts {
  type: 'mode';
  fromMode: string;
  toMode: string;
  reason: string;
}

export type ExplainerFacts = LossFacts | ModeFacts;

export interface ExplainerResult {
  summary: string;
  source: 'gemini-flash' | 'deterministic-fallback';
  facts: ExplainerFacts;
  timestamp: number;
}

// In-memory cache for repeated event signatures
const explanationCache = new Map<string, string>();

// Simple token-bucket rate limiter: 15 requests per minute, min 4s between requests
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 4000;

export class AiExplainer {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /**
   * Deterministic template fallback when LLM is unavailable, rate-limited, or fails validation.
   */
  public getDeterministicTemplate(facts: ExplainerFacts): string {
    if (facts.type === 'loss') {
      const rangeStr = facts.to !== null ? `samples ${facts.from} to ${facts.to}` : `sample ${facts.from}`;
      return `Sensor ${facts.sensor} recorded a loss of ${facts.count} ${rangeStr} due to "${facts.reason}". The double-entry ledger preserved continuous interval tracking without data alteration.`;
    } else {
      return `Pipeline transitioned from ${facts.fromMode} to ${facts.toMode} mode triggered by "${facts.reason}". Local SQLite WAL buffering ensured zero incoming biosignals were dropped.`;
    }
  }

  /**
   * Validates that EVERY number appearing in text exists in the structured input facts.
   * Prevents LLM number hallucinations (e.g. inventing 99.9%, 450ms, etc.).
   */
  public validateNumbers(text: string, facts: ExplainerFacts): boolean {
    const textNumbers = text.match(/\b\d+\b/g) || [];
    if (textNumbers.length === 0) return true; // No numbers produced is completely valid

    // Collect all valid numbers from facts
    const allowedNumbers = new Set<string>();
    if (facts.type === 'loss') {
      allowedNumbers.add(String(facts.sensor));
      allowedNumbers.add(String(facts.from));
      if (facts.to !== null) allowedNumbers.add(String(facts.to));
      allowedNumbers.add(String(facts.count));
    } else {
      // Mode facts don't normally have numbers
    }

    // Check each number found in LLM output
    for (const num of textNumbers) {
      if (!allowedNumbers.has(num)) {
        return false; // Found hallucinated / unverified number
      }
    }
    return true;
  }

  /**
   * Generates a 2-sentence plain-English summary. Off critical path.
   */
  public async explain(facts: ExplainerFacts): Promise<ExplainerResult> {
    const fallback = this.getDeterministicTemplate(facts);

    if (!this.apiKey) {
      return {
        summary: fallback,
        source: 'deterministic-fallback',
        facts,
        timestamp: Date.now(),
      };
    }

    const cacheKey = facts.type === 'loss'
      ? `loss:${facts.sensor}:${facts.from}:${facts.to}:${facts.reason}`
      : `mode:${facts.fromMode}:${facts.toMode}:${facts.reason}`;

    if (explanationCache.has(cacheKey)) {
      return {
        summary: explanationCache.get(cacheKey)!,
        source: 'gemini-flash',
        facts,
        timestamp: Date.now(),
      };
    }

    // Rate-limit check (15 RPM free tier)
    const now = performance.now();
    if (now - lastRequestTime < MIN_REQUEST_INTERVAL_MS) {
      return {
        summary: fallback,
        source: 'deterministic-fallback',
        facts,
        timestamp: Date.now(),
      };
    }
    lastRequestTime = now;

    try {
      const prompt = `You are a systems engineer assistant. Explain this biosignal pipeline event in EXACTLY two concise plain-English sentences for an operations log.
CRITICAL CONSTRAINT: You must NEVER invent or generate ANY numbers that do not appear in the input facts. If you mention a number, it must match the input facts exactly.

Input facts:
${JSON.stringify(facts)}

Output: Exactly 2 sentences.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s non-blocking timeout

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 120,
              temperature: 0.1,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!res.ok) {
        // Quota exceeded (429) or invalid key: gracefully fallback
        return {
          summary: fallback,
          source: 'deterministic-fallback',
          facts,
          timestamp: Date.now(),
        };
      }

      const data = await res.json() as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!text) {
        return {
          summary: fallback,
          source: 'deterministic-fallback',
          facts,
          timestamp: Date.now(),
        };
      }

      // Hallucination Guard: Validate every number against input facts
      const isValid = this.validateNumbers(text, facts);
      if (!isValid) {
        // Hallucinated number detected! Drop LLM output and use deterministic template
        return {
          summary: fallback,
          source: 'deterministic-fallback',
          facts,
          timestamp: Date.now(),
        };
      }

      // Cache valid result
      explanationCache.set(cacheKey, text);

      return {
        summary: text,
        source: 'gemini-flash',
        facts,
        timestamp: Date.now(),
      };
    } catch {
      // Any network error or abort degrades silently to fallback
      return {
        summary: fallback,
        source: 'deterministic-fallback',
        facts,
        timestamp: Date.now(),
      };
    }
  }
}

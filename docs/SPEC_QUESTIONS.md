# SPEC_QUESTIONS.md — Ambiguities Resolved

## 1. round1 implementation
**Spec**: "Round decimals to 1 place."
**Ambiguity**: Half-up vs half-away-from-zero vs banker's rounding.
**Choice**: Half-away-from-zero: `Math.sign(x) * Math.floor(Math.abs(x) * 10 + 0.5) / 10`
**Why not toFixed**: `Number((1.25).toFixed(1))` returns `"1.3"` in V8 but `"1.2"` in some environments (banker's rounding). We want deterministic half-away-from-zero.
**Named constant**: `round1()` function in `src/windows.ts`, re-exported.

## 2. Heart rate window boundary
**Spec**: "peaks within samples 400(w-4)..400(w+1)-1"
**Choice**: hrStart = 400*(w-4), hrEnd = 400*(w+1) [exclusive]. Range is [hrStart, hrEnd).

## 3. Peak lookback: inclusive or exclusive of i?
**Spec**: "the 800 samples before i"
**Choice**: indices i-800..i-1 (800 samples, exclusive of i). Named constant: `PEAK_LOOKBACK = 800`.

## 4. "any sample in that 5s range missing" for HR null
**Choice**: If any index in [400*(w-4), 400*(w+1)) is either lost or not yet stored in sensor1 ch1, HR = null.

## 5. Window finalization lookahead
**Spec**: "sample i+1 after the last candidate peak" must be available.
**Choice**: Window w finalizes only when index 400*(w+1) is known (stored or lost). This is the lookahead.

## 6. Open-ended loss (to_index: null)
**Choice**: Treated as a very large range (from..from+1,000,000) for interval tracking purposes. No coverage guarantees for unknown end. Documented sentinel value.

## 7. Peak detection and lost samples in lookback
**Choice**: If any of the 800 lookback samples is lost (not available), the peak cannot be detected at that position. "Available" means stored.

## 8. magnitude
**Spec**: "mean of sqrt(ch1^2+ch2^2) over available sensor-2 samples"
**Choice**: sensor-2 channels are 0-indexed (ch0, ch1). magnitude = mean over samples where sensor2 data exists.

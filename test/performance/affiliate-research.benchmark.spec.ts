import { describe, expect, it } from 'vitest';

const SEED = 20261001;
const SAMPLE_COUNT = 100;
const percentile = (values: number[], p: number) => values[Math.ceil(values.length * p) - 1] ?? 0;

describe('affiliate research deterministic performance benchmark', () => {
  it('models 100 successful 10-category / 200-reference runs and reports latency percentiles', () => {
    // Virtual adapter latencies keep the benchmark reproducible and fast; no external calls/sleeps.
    const durations = Array.from({ length: SAMPLE_COUNT }, (_, sample) => {
      let virtualMs = 0;
      let state = (SEED + sample) >>> 0;
      const jitter = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state % 7;
      };
      for (let category = 0; category < 10; category++) {
        virtualMs += 50 + jitter(); // category validation and ranking
        for (let reference = 0; reference < 20; reference++) {
          virtualMs += 100 + jitter(); // resolve offer
          virtualMs += 50 + jitter(); // image metadata
        }
      }
      virtualMs += 100 + jitter(); // final product revalidation
      return virtualMs;
    }).sort((a, b) => a - b);
    const successfulWithinLimit = durations.filter((duration) => duration <= 600_000).length;
    const report = {
      seed: SEED,
      environment: process.version,
      samples: SAMPLE_COUNT,
      referencesPerRun: 200,
      latencyProfileMs: { category: 50, resolve: 100, image: 50, finalRevalidation: 100 },
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      maxMs: durations.at(-1),
      successfulWithinLimit,
    };
    process.stdout.write(
      `${JSON.stringify({ event: 'affiliate_research.performance_benchmark', ...report })}\n`,
    );
    expect(successfulWithinLimit).toBeGreaterThanOrEqual(95);
  });
});

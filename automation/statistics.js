/**
 * Statistical Analysis Module
 * Computes descriptive statistics, ANOVA, and Tukey HSD post-hoc test
 */

/**
 * Compute mean of array
 */
export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute median of array
 */
export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Compute variance (population)
 */
export function variance(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

/**
 * Compute standard deviation (sample)
 */
export function stdDev(values) {
  return Math.sqrt(variance(values));
}

/**
 * Compute 95% confidence interval
 */
export function confidenceInterval95(values) {
  if (values.length < 2) return { lower: 0, upper: 0, margin: 0 };
  const m = mean(values);
  const sd = stdDev(values);
  const n = values.length;
  // Using z = 1.96 for 95% CI
  const margin = 1.96 * (sd / Math.sqrt(n));
  return {
    lower: m - margin,
    upper: m + margin,
    margin,
  };
}

/**
 * Full descriptive stats for a set of values
 */
export function describeStats(values) {
  const clean = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (!clean.length) return { n: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0, variance: 0, ci95: { lower: 0, upper: 0, margin: 0 } };
  return {
    n: clean.length,
    mean: mean(clean),
    median: median(clean),
    min: Math.min(...clean),
    max: Math.max(...clean),
    stdDev: stdDev(clean),
    variance: variance(clean),
    ci95: confidenceInterval95(clean),
  };
}

/**
 * One-Way ANOVA
 * Returns F statistic and p-value approximation
 * @param {number[][]} groups - Array of groups (each group is an array of numbers)
 */
export function oneWayANOVA(groups) {
  const k = groups.length; // number of groups
  const n = groups.reduce((sum, g) => sum + g.length, 0); // total observations
  const grandMean = mean(groups.flat());

  // Between-group sum of squares
  const ssBetween = groups.reduce((sum, g) => {
    return sum + g.length * (mean(g) - grandMean) ** 2;
  }, 0);

  // Within-group sum of squares
  const ssWithin = groups.reduce((sum, g) => {
    const gMean = mean(g);
    return sum + g.reduce((gSum, v) => gSum + (v - gMean) ** 2, 0);
  }, 0);

  const dfBetween = k - 1;
  const dfWithin = n - k;

  const msBetween = dfBetween > 0 ? ssBetween / dfBetween : 0;
  const msWithin = dfWithin > 0 ? ssWithin / dfWithin : 0;

  const F = msWithin > 0 ? msBetween / msWithin : 0;

  // Approximate p-value using F-distribution (simplified)
  // For a proper p-value we'd need an F-distribution CDF
  // We provide a simple significance check with F > critical value (approximate)
  const significant = F > 3.0; // Approximate critical F for α=0.05 with small k and n

  return {
    F: F.toFixed(4),
    dfBetween,
    dfWithin,
    msBetween: msBetween.toFixed(4),
    msWithin: msWithin.toFixed(4),
    ssBetween: ssBetween.toFixed(4),
    ssWithin: ssWithin.toFixed(4),
    significant,
    note: 'p-value is approximate; use R or Python scipy for exact p-values',
  };
}

/**
 * Tukey HSD post-hoc test (simplified)
 * Compares all pairs of groups and indicates significant differences
 */
export function tukeyHSD(groups, groupNames) {
  const k = groups.length;
  const n = groups.reduce((sum, g) => sum + g.length, 0);
  const msWithin = (() => {
    const gMeans = groups.map(g => mean(g));
    const grandMean = mean(groups.flat());
    const ssWithin = groups.reduce((sum, g) => {
      const gm = mean(g);
      return sum + g.reduce((s, v) => s + (v - gm) ** 2, 0);
    }, 0);
    return ssWithin / (n - k);
  })();

  const results = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const ni = groups[i].length;
      const nj = groups[j].length;
      const meanDiff = Math.abs(mean(groups[i]) - mean(groups[j]));
      const se = Math.sqrt(msWithin / 2 * (1 / ni + 1 / nj));
      const q = se > 0 ? meanDiff / se : 0;
      // Critical q value for α=0.05 (approximate for k=3-4 groups)
      const qCritical = 3.31;
      results.push({
        group1: groupNames[i],
        group2: groupNames[j],
        meanDiff: meanDiff.toFixed(4),
        q: q.toFixed(4),
        significant: q > qCritical,
        note: `|μ1-μ2|=${meanDiff.toFixed(2)}, q=${q.toFixed(2)}, critical q≈${qCritical}`,
      });
    }
  }
  return results;
}

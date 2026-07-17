/**
 * Report Generator
 * Reads all raw experiment results and generates:
 * - CSV and Excel files
 * - JSON summary files
 * - Interactive HTML dashboard
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import { createObjectCsvWriter } from 'csv-writer';
import { describeStats, oneWayANOVA, tukeyHSD } from './statistics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'research-data');
const RAW_DIR = join(DATA_DIR, 'raw');
const REPORTS_DIR = join(DATA_DIR, 'reports');

function loadAllResults() {
  try {
    const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => JSON.parse(readFileSync(join(RAW_DIR, f), 'utf-8')));
  } catch {
    return [];
  }
}

function flattenResult(r) {
  const { meta, metrics } = r;
  const apiLatency = metrics.api?.length
    ? metrics.api.reduce((sum, a) => sum + (a.responseTime || 0), 0) / metrics.api.length
    : 0;
  const fcp = metrics.performance?.fcp || 0;
  const loadTime = metrics.performance?.loadComplete || metrics.network?.loadTime || 0;
  const ttfb = metrics.performance?.ttfb || 0;

  return {
    experimentId: meta.experimentId,
    version: meta.version,
    runNumber: meta.runNumber,
    network: meta.network,
    battery: meta.battery,
    browser: meta.browser,
    os: meta.os,
    timestamp: meta.timestamp,
    duration: meta.duration,
    status: meta.status,
    fcp,
    loadTime,
    ttfb,
    apiLatency,
    apiRequests: metrics.api?.length || 0,
    failedRequests: metrics.network?.failedRequests || 0,
    totalRequests: metrics.network?.totalRequests || 0,
    transferredBytes: metrics.network?.transferredBytes || 0,
    cacheHitRatio: metrics.cacheHitRatio || 0,
    cacheMissRatio: metrics.cacheMissRatio || 0,
    cacheHits: (metrics.cache || []).filter(l => l.event === 'hit').length,
    cacheMisses: (metrics.cache || []).filter(l => l.event === 'miss').length,
    offlineQueueCreated: metrics.offline?.queueCreated ? 1 : 0,
    offlineQueueLength: metrics.offline?.queueLength || 0,
    syncSuccess: metrics.offline?.syncSuccess || 0,
    adaptiveDecisions: (metrics.adaptive || []).length,
  };
}

async function generateReports() {
  console.log('[Reporter] Loading raw results...');
  mkdirSync(REPORTS_DIR, { recursive: true });

  const results = loadAllResults();
  console.log(`[Reporter] Found ${results.length} experiment results`);

  if (results.length === 0) {
    console.log('[Reporter] No results to process. Run experiments first.');
    return;
  }

  const rows = results.map(flattenResult);

  // ----- 1. Save raw-results.json -----
  writeFileSync(join(REPORTS_DIR, 'raw-results.json'), JSON.stringify(results, null, 2));

  // ----- 2. Save performance.json -----
  const perfRows = rows.map(r => ({
    version: r.version, network: r.network, battery: r.battery,
    fcp: r.fcp, loadTime: r.loadTime, ttfb: r.ttfb, apiLatency: r.apiLatency,
  }));
  writeFileSync(join(REPORTS_DIR, 'performance.json'), JSON.stringify(perfRows, null, 2));

  // ----- 3. Save cache.json -----
  const cacheRows = rows.map(r => ({
    version: r.version, network: r.network, battery: r.battery,
    cacheHits: r.cacheHits, cacheMisses: r.cacheMisses,
    cacheHitRatio: r.cacheHitRatio, cacheMissRatio: r.cacheMissRatio,
  }));
  writeFileSync(join(REPORTS_DIR, 'cache.json'), JSON.stringify(cacheRows, null, 2));

  // ----- 4. Save offline.json -----
  const offlineRows = rows.map(r => ({
    version: r.version, network: r.network,
    offlineQueueCreated: r.offlineQueueCreated, offlineQueueLength: r.offlineQueueLength,
    syncSuccess: r.syncSuccess,
  }));
  writeFileSync(join(REPORTS_DIR, 'offline.json'), JSON.stringify(offlineRows, null, 2));

  // ----- 5. Save adaptive.json -----
  const adaptiveRows = results.flatMap(r =>
    (r.metrics.adaptive || []).map(a => ({ ...a, version: r.meta.version, runNumber: r.meta.runNumber }))
  );
  writeFileSync(join(REPORTS_DIR, 'adaptive.json'), JSON.stringify(adaptiveRows, null, 2));

  // ----- 6. Compute statistics per version -----
  const versions = ['A', 'B', 'C'];
  const statsByVersion = {};
  for (const v of versions) {
    const vRows = rows.filter(r => r.version === v && r.status === 'completed');
    statsByVersion[v] = {
      fcp: describeStats(vRows.map(r => r.fcp)),
      loadTime: describeStats(vRows.map(r => r.loadTime)),
      apiLatency: describeStats(vRows.map(r => r.apiLatency)),
      cacheHitRatio: describeStats(vRows.map(r => r.cacheHitRatio)),
      n: vRows.length,
    };
  }

  // ANOVA on API latency across versions
  const latencyGroups = versions.map(v => rows.filter(r => r.version === v && r.status === 'completed').map(r => r.apiLatency));
  const anova = oneWayANOVA(latencyGroups);
  let tukeyResults = null;
  if (anova.significant) {
    tukeyResults = tukeyHSD(latencyGroups, versions);
  }

  const statistics = {
    byVersion: statsByVersion,
    anova: { metric: 'apiLatency', ...anova },
    tukey: tukeyResults,
    totalExperiments: results.length,
    completedExperiments: results.filter(r => r.meta.status === 'completed').length,
    failedExperiments: results.filter(r => r.meta.status === 'failed').length,
  };

  writeFileSync(join(REPORTS_DIR, 'statistics.json'), JSON.stringify(statistics, null, 2));

  // ----- 7. Save summary.json -----
  const summary = {
    generatedAt: new Date().toISOString(),
    totalRuns: results.length,
    completedRuns: results.filter(r => r.meta.status === 'completed').length,
    versions: {
      A: { name: 'Traditional Web App', count: rows.filter(r => r.version === 'A').length },
      B: { name: 'Fixed Strategy PWA', count: rows.filter(r => r.version === 'B').length },
      C: { name: 'Adaptive Smart PWA', count: rows.filter(r => r.version === 'C').length },
    },
    statistics,
  };
  writeFileSync(join(REPORTS_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  // ----- 8. Generate CSV -----
  const csvWriter = createObjectCsvWriter({
    path: join(REPORTS_DIR, 'results.csv'),
    header: Object.keys(rows[0]).map(key => ({ id: key, title: key })),
  });
  await csvWriter.writeRecords(rows);

  // ----- 9. Generate Excel -----
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PWA Research Automation';
  workbook.created = new Date();

  // Raw Results sheet
  const ws1 = workbook.addWorksheet('All Results');
  ws1.columns = Object.keys(rows[0]).map(key => ({ header: key, key, width: 18 }));
  rows.forEach(row => ws1.addRow(row));

  // Statistics sheet
  const ws2 = workbook.addWorksheet('Statistics');
  ws2.addRow(['Version', 'Metric', 'N', 'Mean', 'Median', 'Min', 'Max', 'StdDev', 'CI95 Lower', 'CI95 Upper']);
  for (const [v, stats] of Object.entries(statsByVersion)) {
    for (const [metric, s] of Object.entries(stats)) {
      if (typeof s === 'object' && s.n !== undefined) {
        ws2.addRow([v, metric, s.n, s.mean?.toFixed(2), s.median?.toFixed(2), s.min?.toFixed(2), s.max?.toFixed(2), s.stdDev?.toFixed(2), s.ci95?.lower?.toFixed(2), s.ci95?.upper?.toFixed(2)]);
      }
    }
  }

  // ANOVA sheet
  const ws3 = workbook.addWorksheet('ANOVA');
  ws3.addRow(['Metric', 'F Statistic', 'df Between', 'df Within', 'MS Between', 'MS Within', 'Significant']);
  ws3.addRow(['apiLatency', anova.F, anova.dfBetween, anova.dfWithin, anova.msBetween, anova.msWithin, anova.significant ? 'YES' : 'NO']);

  if (tukeyResults) {
    const ws4 = workbook.addWorksheet('Tukey HSD');
    ws4.addRow(['Group 1', 'Group 2', 'Mean Difference', 'q statistic', 'Significant']);
    tukeyResults.forEach(r => ws4.addRow([r.group1, r.group2, r.meanDiff, r.q, r.significant ? 'YES' : 'NO']));
  }

  await workbook.xlsx.writeFile(join(REPORTS_DIR, 'results.xlsx'));

  // ----- 10. Generate Interactive HTML Dashboard -----
  await generateDashboard(rows, statistics, summary);

  console.log('[Reporter] ✅ Reports generated in research-data/reports/');
  console.log('[Reporter]   - results.csv');
  console.log('[Reporter]   - results.xlsx');
  console.log('[Reporter]   - statistics.json');
  console.log('[Reporter]   - summary.json');
  console.log('[Reporter]   - dashboard.html');
}

async function generateDashboard(rows, statistics, summary) {
  const versionColors = { A: '#6366f1', B: '#10b981', C: '#8b5cf6' };
  const versionNames = { A: 'Version A (Traditional)', B: 'Version B (Fixed PWA)', C: 'Version C (Adaptive PWA)' };

  const fcpData = ['A', 'B', 'C'].map(v => ({
    version: v,
    values: rows.filter(r => r.version === v).map(r => r.fcp).filter(v => v > 0),
  }));

  const latencyData = ['A', 'B', 'C'].map(v => ({
    version: v,
    values: rows.filter(r => r.version === v).map(r => r.apiLatency).filter(v => v > 0),
  }));

  const cacheHitData = ['B', 'C'].map(v => ({
    version: v,
    values: rows.filter(r => r.version === v).map(r => r.cacheHitRatio),
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PWA Research Dashboard - Smart Adaptive Caching</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
  header { background: #1e293b; border-bottom: 1px solid #334155; padding: 24px 32px; }
  header h1 { font-size: 24px; font-weight: 700; color: #f1f5f9; }
  header p { color: #94a3b8; margin-top: 4px; }
  .badges { display: flex; gap: 12px; margin-top: 12px; }
  .badge { background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 4px 12px; font-size: 12px; color: #94a3b8; }
  .badge strong { color: #e2e8f0; }
  main { max-width: 1400px; margin: 0 auto; padding: 32px; }
  .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 24px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; }
  .card h2 { font-size: 16px; font-weight: 600; color: #94a3b8; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
  .card canvas { max-height: 300px; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
  .stat-card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .stat-card .value { font-size: 28px; font-weight: 700; color: #f1f5f9; margin: 4px 0; }
  .stat-card .sub { font-size: 12px; color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; font-size: 12px; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #334155; }
  td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #1e293b; }
  tr:hover td { background: #0f172a; }
  .sig-yes { color: #10b981; font-weight: 600; }
  .sig-no { color: #64748b; }
  .version-a { color: #6366f1; }
  .version-b { color: #10b981; }
  .version-c { color: #8b5cf6; }
</style>
</head>
<body>
<header>
  <h1>Smart Adaptive Caching PWA — Research Dashboard</h1>
  <p>Automated experiment results comparing Traditional, Fixed, and Adaptive caching strategies</p>
  <div class="badges">
    <div class="badge">Generated: <strong>${new Date().toLocaleString()}</strong></div>
    <div class="badge">Total Runs: <strong>${summary.totalRuns}</strong></div>
    <div class="badge">Completed: <strong>${summary.completedRuns}</strong></div>
  </div>
</header>

<main>
  <!-- Summary Stats -->
  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Version A Runs</div>
      <div class="value version-a">${summary.versions.A.count}</div>
      <div class="sub">Traditional Web App</div>
    </div>
    <div class="stat-card">
      <div class="label">Version B Runs</div>
      <div class="value version-b">${summary.versions.B.count}</div>
      <div class="sub">Fixed Strategy PWA</div>
    </div>
    <div class="stat-card">
      <div class="label">Version C Runs</div>
      <div class="value version-c">${summary.versions.C.count}</div>
      <div class="sub">Adaptive Smart PWA</div>
    </div>
    <div class="stat-card">
      <div class="label">ANOVA Significant</div>
      <div class="value" style="color: ${statistics.anova.significant ? '#10b981' : '#ef4444'}">${statistics.anova.significant ? 'YES' : 'NO'}</div>
      <div class="sub">F = ${statistics.anova.F}</div>
    </div>
  </div>

  <!-- Charts -->
  <div class="grid-2">
    <div class="card">
      <h2>First Contentful Paint (FCP) by Version</h2>
      <canvas id="fcpChart"></canvas>
    </div>
    <div class="card">
      <h2>Average API Latency by Version</h2>
      <canvas id="latencyChart"></canvas>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Cache Hit Ratio (Version B vs C)</h2>
      <canvas id="cacheHitChart"></canvas>
    </div>
    <div class="card">
      <h2>Experiment Status Distribution</h2>
      <canvas id="statusChart"></canvas>
    </div>
  </div>

  <!-- Statistics Table -->
  <div class="card" style="margin-bottom: 24px;">
    <h2>Descriptive Statistics — API Latency (ms)</h2>
    <table>
      <thead>
        <tr><th>Version</th><th>N</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th><th>Std Dev</th><th>CI 95% Lower</th><th>CI 95% Upper</th></tr>
      </thead>
      <tbody>
        ${['A', 'B', 'C'].map(v => {
          const s = statistics.byVersion[v]?.apiLatency;
          if (!s || !s.n) return `<tr><td class="version-${v.toLowerCase()}">${v}</td><td colspan="8">No data</td></tr>`;
          return `<tr>
            <td class="version-${v.toLowerCase()}">${versionNames[v]}</td>
            <td>${s.n}</td>
            <td>${s.mean?.toFixed(2)}</td>
            <td>${s.median?.toFixed(2)}</td>
            <td>${s.min?.toFixed(2)}</td>
            <td>${s.max?.toFixed(2)}</td>
            <td>${s.stdDev?.toFixed(2)}</td>
            <td>${s.ci95?.lower?.toFixed(2)}</td>
            <td>${s.ci95?.upper?.toFixed(2)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- ANOVA Table -->
  <div class="card">
    <h2>One-Way ANOVA — API Latency across Versions</h2>
    <table>
      <thead>
        <tr><th>F Statistic</th><th>df Between</th><th>df Within</th><th>MS Between</th><th>MS Within</th><th>Significant (α=0.05)</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>${statistics.anova.F}</td>
          <td>${statistics.anova.dfBetween}</td>
          <td>${statistics.anova.dfWithin}</td>
          <td>${statistics.anova.msBetween}</td>
          <td>${statistics.anova.msWithin}</td>
          <td class="${statistics.anova.significant ? 'sig-yes' : 'sig-no'}">${statistics.anova.significant ? '✓ YES' : '✗ NO'}</td>
        </tr>
      </tbody>
    </table>
    ${statistics.tukey ? `
    <h2 style="margin-top: 24px;">Tukey HSD Post-Hoc Comparisons</h2>
    <table>
      <thead><tr><th>Group 1</th><th>Group 2</th><th>Mean Diff (ms)</th><th>q Statistic</th><th>Significant</th></tr></thead>
      <tbody>
        ${statistics.tukey.map(t => `
        <tr>
          <td class="version-${t.group1.toLowerCase()}">${versionNames[t.group1]}</td>
          <td class="version-${t.group2.toLowerCase()}">${versionNames[t.group2]}</td>
          <td>${t.meanDiff}</td>
          <td>${t.q}</td>
          <td class="${t.significant ? 'sig-yes' : 'sig-no'}">${t.significant ? '✓ YES' : '✗ NO'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p style="color:#64748b; margin-top:12px;">Tukey HSD not performed (ANOVA not significant)</p>'}
  </div>
</main>

<script>
const chartDefaults = {
  plugins: { legend: { labels: { color: '#94a3b8' } } },
  scales: {
    x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
    y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
  }
};

// FCP Chart
new Chart(document.getElementById('fcpChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(fcpData.map(d => versionNames[d.version]))},
    datasets: [{
      label: 'Mean FCP (ms)',
      data: ${JSON.stringify(fcpData.map(d => d.values.length ? (d.values.reduce((a, b) => a + b, 0) / d.values.length).toFixed(2) : 0))},
      backgroundColor: ['#6366f1', '#10b981', '#8b5cf6'],
    }]
  },
  options: { ...chartDefaults, plugins: { ...chartDefaults.plugins } }
});

// Latency Chart
new Chart(document.getElementById('latencyChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(latencyData.map(d => versionNames[d.version]))},
    datasets: [{
      label: 'Mean Latency (ms)',
      data: ${JSON.stringify(latencyData.map(d => d.values.length ? (d.values.reduce((a, b) => a + b, 0) / d.values.length).toFixed(2) : 0))},
      backgroundColor: ['#6366f1', '#10b981', '#8b5cf6'],
    }]
  },
  options: { ...chartDefaults }
});

// Cache Hit Chart
new Chart(document.getElementById('cacheHitChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(cacheHitData.map(d => versionNames[d.version]))},
    datasets: [{
      label: 'Cache Hit Ratio',
      data: ${JSON.stringify(cacheHitData.map(d => d.values.length ? (d.values.reduce((a, b) => a + b, 0) / d.values.length).toFixed(3) : 0))},
      backgroundColor: ['#10b981', '#8b5cf6'],
    }]
  },
  options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, max: 1 } } }
});

// Status Chart
const completed = ${rows.filter(r => r.status === 'completed').length};
const failed = ${rows.filter(r => r.status === 'failed').length};
new Chart(document.getElementById('statusChart'), {
  type: 'doughnut',
  data: {
    labels: ['Completed', 'Failed'],
    datasets: [{ data: [completed, failed], backgroundColor: ['#10b981', '#ef4444'] }]
  },
  options: { plugins: { legend: { labels: { color: '#94a3b8' } } } }
});
</script>
</body>
</html>`;

  writeFileSync(join(REPORTS_DIR, 'dashboard.html'), html);
}

// Run reporter
generateReports().catch(err => {
  console.error('[Reporter] Fatal error:', err);
  process.exit(1);
});

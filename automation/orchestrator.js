/**
 * Research Orchestrator
 * Main entry point for the 120-run experiment matrix
 *
 * Experiment Matrix (per config):
 *   Versions:  A, B, C
 *   Networks:  Fast4G, Slow3G, Offline
 *   Battery:   HIGH, LOW (Version C only — A/B don't use battery sim)
 *
 * Total unique conditions:
 *   Version A: 3 networks × 1 battery = 3 conditions
 *   Version B: 3 networks × 1 battery = 3 conditions
 *   Version C: 3 networks × 2 battery = 6 conditions
 *   Total: 12 conditions × 10 runs = 120 experiments
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runExperiment } from './experimentRunner.js';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'research.config.json'), 'utf-8'));
const DATA_DIR = join(ROOT, 'research-data');

const IS_DRY_RUN = process.argv.includes('--dry-run');

// Ensure all output directories exist
function ensureDirectories() {
  const dirs = ['raw', 'processed', 'reports', 'charts', 'logs', 'screenshots', 'lighthouse'];
  dirs.forEach(d => mkdirSync(join(DATA_DIR, d), { recursive: true }));
}

// Build the full experiment matrix
function buildExperimentMatrix() {
  const { versions, network_profiles, battery_modes, runs } = CONFIG;
  const networks = Object.keys(network_profiles);
  const experiments = [];

  for (const version of versions) {
    for (const network of networks) {
      // Version C uses both battery modes; A and B only use HIGH (no battery sim)
      const batteries = version === 'C' ? battery_modes : ['HIGH'];
      for (const battery of batteries) {
        for (let run = 1; run <= runs; run++) {
          experiments.push({ version, network, battery, runNumber: run });
        }
      }
    }
  }

  return experiments;
}

// Sleep helper for cooldown between runs
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run with retry logic
async function runWithRetry(params, maxRetries = CONFIG.retries || 2) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await runExperiment(params);
      if (result.meta.status === 'completed') return result;
      if (attempt < maxRetries) {
        console.log(chalk.yellow(`  [Retry ${attempt}/${maxRetries}] Experiment incomplete, retrying in 5s...`));
        await sleep(5000);
      }
      lastError = new Error(`Experiment status: ${result.meta.status}`);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        console.log(chalk.yellow(`  [Retry ${attempt}/${maxRetries}] Error: ${err.message}, retrying in 5s...`));
        await sleep(5000);
      }
    }
  }
  throw lastError;
}

async function main() {
  console.log(chalk.blue.bold('\n🔬 Smart Adaptive Caching PWA — Research Orchestrator'));
  console.log(chalk.gray('═'.repeat(60)));

  ensureDirectories();
  const matrix = buildExperimentMatrix();

  console.log(chalk.cyan(`\nExperiment Matrix:`));
  console.log(chalk.gray(`  Total experiments: ${matrix.length}`));
  console.log(chalk.gray(`  Versions: ${CONFIG.versions.join(', ')}`));
  console.log(chalk.gray(`  Networks: ${Object.keys(CONFIG.network_profiles).join(', ')}`));
  console.log(chalk.gray(`  Battery modes: ${CONFIG.battery_modes.join(', ')}`));
  console.log(chalk.gray(`  Runs per condition: ${CONFIG.runs}`));
  console.log(chalk.gray(`  Retry limit: ${CONFIG.retries || 2}`));

  if (IS_DRY_RUN) {
    console.log(chalk.yellow('\n[DRY RUN] — No experiments will be run. Matrix validated.'));
    matrix.slice(0, 5).forEach(e => {
      console.log(chalk.gray(`  → Version=${e.version} Network=${e.network} Battery=${e.battery} Run#${e.runNumber}`));
    });
    console.log(chalk.gray(`  ... and ${matrix.length - 5} more`));
    return;
  }

  const startTime = Date.now();
  const allResults = [];
  const failedExperiments = [];

  let completed = 0;
  let failed = 0;

  for (const params of matrix) {
    const label = `V${params.version} ${params.network} ${params.battery} #${params.runNumber}`;

    try {
      const result = await runWithRetry(params);
      allResults.push(result);
      completed++;
      const pct = ((completed + failed) / matrix.length * 100).toFixed(1);
      console.log(chalk.green(`  ✓ [${pct}%] ${label} completed (${result.meta.duration}ms)`));
    } catch (err) {
      failed++;
      failedExperiments.push({ ...params, error: err.message });
      console.log(chalk.red(`  ✗ [${((completed + failed) / matrix.length * 100).toFixed(1)}%] ${label} FAILED: ${err.message}`));
    }

    // Cooldown between runs to prevent browser resource exhaustion
    await sleep(1500);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Save orchestration report
  const report = {
    completedAt: new Date().toISOString(),
    totalExperiments: matrix.length,
    completed,
    failed,
    totalMinutes: totalTime,
    failedExperiments,
  };

  writeFileSync(join(DATA_DIR, 'logs', 'orchestration-report.json'), JSON.stringify(report, null, 2));

  console.log(chalk.blue.bold('\n\n🏁 Orchestration Complete'));
  console.log(chalk.gray('═'.repeat(60)));
  console.log(chalk.green(`  ✓ Completed: ${completed}`));
  if (failed > 0) console.log(chalk.red(`  ✗ Failed:    ${failed}`));
  console.log(chalk.cyan(`  ⏱  Total time: ${totalTime} minutes`));
  console.log(chalk.gray('\nNext step: Generate reports'));
  console.log(chalk.white('  npm run report\n'));
}

main().catch(err => {
  console.error(chalk.red('\n[FATAL] Orchestrator crashed:'), err.message);
  process.exit(1);
});

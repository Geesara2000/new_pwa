# Smart Adaptive Caching in PWAs — Research Platform

This project implements a complete, automated research environment designed to compare frontend caching strategies across Traditional, Fixed PWA (Stale-While-Revalidate), and Smart Adaptive PWA configurations. 

It is designed for the research title:
> **Smart Adaptive Caching in Progressive Web Applications: Improving Performance, Offline Reliability, and Energy Efficiency Compared to Traditional Web Applications**

---

## Architecture Overview

```
                        ┌───────────────────────────────┐
                        │      Research Orchestrator    │
                        │   (Playwright Automation)    │
                        └───────────────┬───────────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 ▼                      ▼                      ▼
       ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
       │    Version A     │    │    Version B     │    │    Version C     │
       │ Traditional Web  │    │  Fixed PWA (SWR) │    │   Adaptive PWA   │
       │   (No Cache)     │    │  (sw-fixed.js)   │    │ (sw-adaptive.js) │
       └─────────┬────────┘    └────────┬─────────┘    └────────┬─────────┘
                 │                      │                       │
                 └──────────────────────┼───────────────────────┘
                                        ▼
                         ┌─────────────────────────────┐
                         │    Single Laravel Backend   │
                         │    MySQL /api Database      │
                         └─────────────────────────────┘
```

---

## Features

1. **Three Frontend Variations**:
   - **Version A**: Traditional Web Application. No caching, no offline support.
   - **Version B**: Fixed PWA. Uses Stale-While-Revalidate strategy for all requests, IndexedDB offline queuing.
   - **Version C**: Adaptive Smart PWA. Dynamically transitions between Cache First and Network First based on battery levels (simulated) and network conditions.
2. **Automated Test Matrix (120-run grid)**:
   - Evaluates 3 Versions × 3 Network Conditions (Fast4G, Slow3G, Offline) × 2 Battery Modes (HIGH, LOW) × 10 Runs.
   - Full orchestration using Playwright, CDP Network Throttling, and Custom Headers.
3. **Statistical Analysis**:
   - Computes descriptive statistics (mean, median, standard deviation, variance, 95% Confidence Intervals).
   - Performs One-Way ANOVA and Tukey's HSD post-hoc analysis directly on response latencies.
4. **Interactive Dashboard**:
   - Generates an HTML dashboard showcasing visual performance charts, cache hit distributions, and statistical significance tests.

---

## Installation & Setup

### Prerequisites
- Node.js (v20+ recommended)
- PHP 8.2+ & Composer
- MySQL Database Server

### 1. Database Configuration
Create a database in your local MySQL instance:
```sql
CREATE DATABASE IF NOT EXISTS new_pwa_research;
```
Configure database credentials in `/backend/.env`.

### 2. Backend Setup
```bash
cd backend
composer install
php artisan migrate:fresh --seed
```

### 3. Frontend Installations
Install dependencies across all three versions:
```bash
cd frontend-version-a && npm install
cd ../frontend-version-b && npm install
cd ../frontend-version-c && npm install
cd ..
```

### 4. Root Automation Installation
```bash
npm install
npx playwright install chromium
```

---

## Running Experiments

To run the complete automated 120-run benchmarking matrix:

1. **Start the Laravel Backend**:
   ```bash
   cd backend
   php artisan serve --port=8000
   ```

2. **Start Frontends** (each on their assigned ports):
   - Version A: `cd frontend-version-a && npm run dev` (Port 3001)
   - Version B: `cd frontend-version-b && npm run dev` (Port 3002)
   - Version C: `cd frontend-version-c && npm run dev` (Port 3003)

3. **Launch the Orchestrator** (in a separate terminal):
   ```bash
   # Dry-run to validate matrix configuration
   npm run test
   
   # Run the full suite
   npm run research
   ```

4. **Compile Reports**:
   ```bash
   npm run report
   ```
   Open `research-data/reports/dashboard.html` in your browser to inspect the interactive graphs and statistical tables.

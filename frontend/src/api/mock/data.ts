/**
 * Synthetic battery data + a mock ECM+EKF SoC estimate.
 *
 * This stands in for the real backend so the whole pipeline runs end-to-end
 * with plausible-looking data. When the FastAPI + estimator backend exists,
 * this file is deleted and `client.ts` points at real HTTP endpoints.
 */

import type {
  CanonicalDataset,
  DatasetSummary,
  EstimateSeries,
  EstimatorConfig,
  ModelDescriptor,
  RunResult,
} from '../../types/contract';
import { mae, maxAbsError, rmse } from '../../lib/metrics';

// ---------------------------------------------------------------------------
// Synthetic dynamic drive-cycle discharge
// ---------------------------------------------------------------------------

interface SynthOptions {
  seed?: number;
  durationS?: number;
  dtS?: number;
  nominalCapacityAh?: number;
  soc0?: number;
}

/** Tiny deterministic PRNG so datasets are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth open-circuit-voltage curve OCV(SoC), roughly NMC-shaped. */
function ocv(soc: number): number {
  const s = Math.min(1, Math.max(0, soc));
  return 3.2 + 0.9 * s + 0.35 * Math.sin(Math.PI * s) - 0.05 * (1 - s) ** 3;
}

function buildDataset(id: string, source: string, opts: SynthOptions = {}): CanonicalDataset {
  const {
    seed = 42,
    durationS = 3600,
    dtS = 1,
    nominalCapacityAh = 2.5,
    soc0 = 0.95,
  } = opts;

  const rand = mulberry32(seed);
  const n = Math.floor(durationS / dtS) + 1;
  const capacityAs = nominalCapacityAh * 3600;
  const R0 = 0.045; // ohm, ohmic drop for the terminal-voltage synthesis

  const t: number[] = new Array(n);
  const current_A: number[] = new Array(n);
  const voltage_V: number[] = new Array(n);
  const temperature_C: number[] = new Array(n);
  const socTrue: number[] = new Array(n);

  let soc = soc0;
  for (let k = 0; k < n; k++) {
    const time = k * dtS;
    // Dynamic discharge current: baseline load + drive-cycle ripple + occasional pulses.
    const base = -1.2; // net discharge
    const ripple = 0.8 * Math.sin(time / 90) + 0.4 * Math.sin(time / 17);
    const pulse = rand() < 0.02 ? -2.5 * rand() : 0;
    const i = base + ripple + pulse;

    // Coulomb-count the ground-truth SoC.
    soc = Math.min(1, Math.max(0, soc + (i * dtS) / capacityAs));

    const temp = 25 + 4 * (1 - soc) + 0.3 * (rand() - 0.5);
    const v = ocv(soc) + i * R0 + 0.004 * (rand() - 0.5);

    t[k] = time;
    current_A[k] = round(i, 4);
    voltage_V[k] = round(v, 4);
    temperature_C[k] = round(temp, 2);
    socTrue[k] = soc;
  }

  const ds: CanonicalDataset = {
    id,
    metadata: {
      chemistry: 'NMC',
      nominalCapacityAh,
      formFactor: 'cylindrical',
      topology: '1S1P',
      protocol: 'dynamic drive cycle',
      source,
      sampleCount: n,
      durationS,
    },
    series: { t, current_A, voltage_V, temperature_C },
  };
  // Stash the hidden ground truth on the module so the mock estimator can "cheat".
  groundTruth.set(id, socTrue);
  return ds;
}

const groundTruth = new Map<string, number[]>();

function round(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

// ---------------------------------------------------------------------------
// Built-in dataset catalog (stand-ins for NASA / Oxford / LG18650 etc.)
// ---------------------------------------------------------------------------

const CATALOG: { summary: DatasetSummary; build: () => CanonicalDataset }[] = [
  {
    summary: {
      id: 'lg-18650-dyn',
      label: 'LG 18650HG2 — dynamic drive cycle (synthetic)',
      source: 'built-in',
      chemistry: 'NMC',
      nominalCapacityAh: 3.0,
      sampleCount: 3601,
      builtIn: true,
    },
    build: () => buildDataset('lg-18650-dyn', 'LG 18650HG2 (synthetic)', { seed: 7, nominalCapacityAh: 3.0 }),
  },
  {
    summary: {
      id: 'nasa-b0005',
      label: 'NASA B0005 — repeated cycling (synthetic)',
      source: 'built-in',
      chemistry: 'NMC',
      nominalCapacityAh: 2.0,
      sampleCount: 3601,
      builtIn: true,
    },
    build: () => buildDataset('nasa-b0005', 'NASA B0005 (synthetic)', { seed: 19, nominalCapacityAh: 2.0, soc0: 0.9 }),
  },
  {
    summary: {
      id: 'oxford-cell1',
      label: 'Oxford Path — pouch cell 1 (synthetic)',
      source: 'built-in',
      chemistry: 'NMC',
      nominalCapacityAh: 0.74,
      sampleCount: 3601,
      builtIn: true,
    },
    build: () => buildDataset('oxford-cell1', 'Oxford Path cell 1 (synthetic)', { seed: 31, nominalCapacityAh: 0.74, soc0: 1.0 }),
  },
];

export function listDatasets(): DatasetSummary[] {
  return CATALOG.map((c) => c.summary);
}

export function getDataset(id: string): CanonicalDataset {
  const entry = CATALOG.find((c) => c.summary.id === id);
  if (!entry) throw new Error(`Unknown dataset: ${id}`);
  return entry.build();
}

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

export function listModels(): ModelDescriptor[] {
  return [
    {
      id: 'ecm_ekf',
      name: 'ECM + EKF',
      available: true,
      supportedTargets: ['SoC'],
      description:
        'Equivalent-circuit model with an Extended Kalman Filter. Estimates SoC from voltage/current; converges from a wrong initial guess. (Phase 1 MVP.)',
    },
    {
      id: 'ml',
      name: 'Machine Learning',
      available: true,
      supportedTargets: ['SoH', 'RUL'],
      description: 'Data-driven SoH/RUL estimation trained on public cycling datasets. (Phase 2.)',
    },
    {
      id: 'pybamm',
      name: 'Electrochemical (PyBaMM)',
      available: true,
      supportedTargets: ['voltage', 'thermal'],
      description: 'Physics-based DFN/SPMe simulation for voltage & thermal response. (Phase 3.)',
    },
  ];
}

// ---------------------------------------------------------------------------
// Custom Dataset Management
// ---------------------------------------------------------------------------

export function addCustomDataset(dataset: CanonicalDataset, summary: DatasetSummary, truthSoc?: number[]) {
  CATALOG.push({ summary, build: () => dataset });
  if (truthSoc) {
    groundTruth.set(dataset.id, truthSoc);
  }
}

// ---------------------------------------------------------------------------
// Mock Estimators
// ---------------------------------------------------------------------------

export function runEstimator(dataset: CanonicalDataset, config: EstimatorConfig): RunResult {
  if (config.modelId === 'ml') {
    return runMLEstimator(dataset, config);
  }
  if (config.modelId === 'pybamm') {
    return runPyBaMMEstimator(dataset, config);
  }
  return runECMEKFEstimator(dataset, config);
}

function runECMEKFEstimator(dataset: CanonicalDataset, config: EstimatorConfig): RunResult {
  const started = performance.now();
  const truth = groundTruth.get(dataset.id) ?? dataset.series.voltage_V.map(() => 0.5);
  const t = dataset.series.t;
  const n = t.length;

  const rand = mulberry32(1234);
  const initialGuess = Number(config.params.initialSoC ?? 0.7);
  const tau = 180; // convergence time constant (s)

  const value: number[] = new Array(n);
  const sigma: number[] = new Array(n);
  const reference: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const conv = Math.exp(-t[k] / tau);
    const bias = (initialGuess - truth[0]) * conv;
    const noise = 0.004 * (rand() - 0.5);
    value[k] = clamp01(truth[k] + bias + noise);
    sigma[k] = 0.002 + 0.05 * conv; // wide early, tightens as it converges
    reference[k] = truth[k];
  }

  const socEstimate: EstimateSeries = { t, value, sigma, reference };

  // Report metrics over the converged region (skip the first 5 * tau seconds).
  const startIdx = Math.min(n - 1, Math.floor((5 * tau) / (t[1] - t[0] || 1)));
  const pv = value.slice(startIdx).map((x) => x * 100);
  const rv = reference.slice(startIdx).map((x) => x * 100);

  const runtimeMs = performance.now() - started;
  return {
    jobId: '',
    primaryTarget: 'SoC',
    estimates: { SoC: socEstimate },
    metrics: [
      { name: 'RMSE (converged)', value: round(rmse(pv, rv), 3), unit: '% SoC' },
      { name: 'MAE (converged)', value: round(mae(pv, rv), 3), unit: '% SoC' },
      { name: 'Max error (converged)', value: round(maxAbsError(pv, rv), 3), unit: '% SoC' },
      { name: 'Convergence time', value: Math.round(3 * tau), unit: 's' },
    ],
    provenance: {
      modelId: config.modelId,
      modelVersion: 'mock-0.1',
      datasetId: dataset.id,
      params: config.params,
      finishedAt: new Date().toISOString(),
      runtimeMs: Math.round(runtimeMs),
    },
  };
}

function runMLEstimator(dataset: CanonicalDataset, config: EstimatorConfig): RunResult {
  const started = performance.now();
  const t = dataset.series.t;
  const n = t.length;
  const rand = mulberry32(5678);

  const primaryTarget = (config.targets[0] || 'SoH') as 'SoH' | 'RUL';

  const value: number[] = new Array(n);
  const sigma: number[] = new Array(n);
  const reference: number[] = new Array(n);

  if (primaryTarget === 'SoH') {
    const initialSoH = Number(config.params.initialSoH ?? 0.95);
    // Simulate a slightly noisy degradation curve
    for (let k = 0; k < n; k++) {
      const normalizedTime = t[k] / (t[n - 1] || 1);
      const dec = 0.003 * normalizedTime;
      const noise = 0.0005 * (rand() - 0.5);
      value[k] = clamp01(initialSoH - dec + noise);
      sigma[k] = 0.005; // Tight 0.5% uncertainty band
      reference[k] = initialSoH - dec;
    }
  } else {
    // RUL: cycles remaining
    const initialRUL = Number(config.params.initialRUL ?? 800);
    for (let k = 0; k < n; k++) {
      const normalizedTime = t[k] / (t[n - 1] || 1);
      const dec = 2.0 * normalizedTime;
      const noise = 0.5 * (rand() - 0.5);
      value[k] = Math.max(0, initialRUL - dec + noise);
      sigma[k] = 12.0; // 12 cycles uncertainty
      reference[k] = initialRUL - dec;
    }
  }

  const estimateSeries: EstimateSeries = { t, value, sigma, reference };
  const runtimeMs = performance.now() - started;

  const metrics = primaryTarget === 'SoH' ? [
    { name: 'MAE', value: round(mae(value.map(x => x * 100), reference.map(x => x * 100)), 3), unit: '% SoH' },
    { name: 'Max error', value: round(maxAbsError(value.map(x => x * 100), reference.map(x => x * 100)), 3), unit: '% SoH' },
    { name: 'Model confidence', value: 96.5, unit: '%' }
  ] : [
    { name: 'MAE', value: round(mae(value, reference), 3), unit: 'cyc' },
    { name: 'Max error', value: round(maxAbsError(value, reference), 3), unit: 'cyc' },
    { name: 'Estimated EOL Cycle', value: Math.round(Number(config.params.initialRUL ?? 800) + 240), unit: 'cyc' }
  ];

  return {
    jobId: '',
    primaryTarget,
    estimates: { [primaryTarget]: estimateSeries },
    metrics,
    provenance: {
      modelId: config.modelId,
      modelVersion: 'ml-mock-0.1',
      datasetId: dataset.id,
      params: config.params,
      finishedAt: new Date().toISOString(),
      runtimeMs: Math.round(runtimeMs),
    },
  };
}

function runPyBaMMEstimator(dataset: CanonicalDataset, config: EstimatorConfig): RunResult {
  const started = performance.now();
  const t = dataset.series.t;
  const n = t.length;
  const rand = mulberry32(9012);

  const primaryTarget = (config.targets[0] || 'voltage') as 'voltage' | 'thermal';

  const value: number[] = new Array(n);
  const sigma: number[] = new Array(n);
  const reference: number[] = new Array(n);

  if (primaryTarget === 'voltage') {
    const rawV = dataset.series.voltage_V;
    const offset = 0.012; // 12mV electrochemical prediction offset
    for (let k = 0; k < n; k++) {
      const noise = 0.002 * (rand() - 0.5);
      value[k] = rawV[k] + offset * Math.sin(t[k] / 400) + noise;
      sigma[k] = 0.008; // 8mV bounds
      reference[k] = rawV[k];
    }
  } else {
    // Thermal estimation
    const rawT = dataset.series.temperature_C;
    const initialCellTemp = Number(config.params.initialCellTemp ?? 25.0);
    for (let k = 0; k < n; k++) {
      const refT = rawT[k] !== null && rawT[k] !== undefined ? (rawT[k] as number) : initialCellTemp;
      const noise = 0.04 * (rand() - 0.5);
      value[k] = refT + 0.15 * Math.sin(t[k] / 300) + noise;
      sigma[k] = 0.25; // 0.25C bounds
      reference[k] = refT;
    }
  }

  const estimateSeries: EstimateSeries = { t, value, sigma, reference };
  const runtimeMs = performance.now() - started;

  const metrics = primaryTarget === 'voltage' ? [
    { name: 'RMSE', value: round(rmse(value.map(x => x * 1000), reference.map(x => x * 1000)), 2), unit: 'mV' },
    { name: 'Max error', value: round(maxAbsError(value.map(x => x * 1000), reference.map(x => x * 1000)), 2), unit: 'mV' },
    { name: 'Solver runtime', value: Math.round(runtimeMs * 1.5), unit: 'ms' }
  ] : [
    { name: 'RMSE', value: round(rmse(value, reference), 3), unit: '°C' },
    { name: 'Max error', value: round(maxAbsError(value, reference), 3), unit: '°C' },
    { name: 'Peak Temp error', value: 0.12, unit: '°C' }
  ];

  return {
    jobId: '',
    primaryTarget,
    estimates: { [primaryTarget]: estimateSeries },
    metrics,
    provenance: {
      modelId: config.modelId,
      modelVersion: 'pybamm-mock-0.1',
      datasetId: dataset.id,
      params: config.params,
      finishedAt: new Date().toISOString(),
      runtimeMs: Math.round(runtimeMs),
    },
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

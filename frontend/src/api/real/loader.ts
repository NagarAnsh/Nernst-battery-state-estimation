/**
 * Loader for REAL, pre-computed results.
 *
 * These JSON files are produced on the modelling machine by
 * `ECM-EKF/export_to_web.m` from an actual Simulink DEKF run. This is the IP
 * boundary of the product: the model itself is never shipped to the browser —
 * only the numeric result of a run it already performed. That keeps the
 * estimator private while still letting the site show verifiable, non-synthetic
 * numbers, and it needs no backend at all.
 *
 * Shapes match `types/contract.ts` exactly, so a real result is interchangeable
 * with a mock one everywhere downstream.
 */

import type {
  CanonicalDataset,
  CycleCurves,
  DatasetSummary,
  EcmParameterCurves,
  RunResult,
  TemperatureSweep,
} from '../../types/contract';

export const REAL_DATASET_ID = 'lg80-capacity-test';

const base = import.meta.env.BASE_URL ?? '/';
const url = (f: string) => `${base}results/${f}`;

/** Listing entry — static so the dataset list renders without a fetch. */
export const REAL_DATASET_SUMMARY: DatasetSummary = {
  id: REAL_DATASET_ID,
  label: '80 Ah NMC — 12-cycle capacity test (real lab data)',
  source: 'Lab capacity test — 80 Ah cell',
  chemistry: 'NMC',
  nominalCapacityAh: 79.63,
  sampleCount: 415426,
  builtIn: true,
};

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(url(file));
  if (!res.ok) {
    throw new Error(`Failed to load ${file}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// Results are immutable once exported, so fetch each file at most once.
const cache = new Map<string, Promise<unknown>>();
function once<T>(file: string): Promise<T> {
  if (!cache.has(file)) cache.set(file, fetchJson<T>(file));
  return cache.get(file) as Promise<T>;
}

export const loadRealDataset = () => once<CanonicalDataset>('dataset-lg80.json');
export const loadRealResult = () => once<RunResult>('result-ecm-ekf-lg80.json');
export const loadParamCurves = () => once<EcmParameterCurves>('param-curves.json');
export const loadCycleCurves = () => once<CycleCurves>('cycles.json');
export const loadTemperatureSweep = () => once<TemperatureSweep>('temperature.json');

export const isRealDataset = (id: string) => id === REAL_DATASET_ID;

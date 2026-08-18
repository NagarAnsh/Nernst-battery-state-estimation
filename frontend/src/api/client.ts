/**
 * Typed API client. Every function maps 1:1 to a future REST endpoint, so the
 * only thing that changes when the FastAPI backend lands is the body of each
 * function (fetch instead of mock). Signatures — the contract — stay fixed.
 *
 *   listDatasets      -> GET  /datasets
 *   getDataset        -> GET  /datasets/{id}
 *   listModels        -> GET  /models
 *   createRun         -> POST /runs
 *   getRun            -> GET  /runs/{id}
 *   getRunResult      -> GET  /runs/{id}/result
 */

import type {
  CanonicalDataset,
  DatasetSummary,
  ModelDescriptor,
  RunJob,
  RunRequest,
  RunResult,
} from '../types/contract';
import * as mock from './mock/data';
import {
  REAL_DATASET_SUMMARY,
  isRealDataset,
  loadRealDataset,
  loadRealResult,
} from './real/loader';

/** Flip to false once the FastAPI backend is reachable. */
export const USE_MOCK = true;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- read endpoints -------------------------------------------------------

export async function listDatasets(): Promise<DatasetSummary[]> {
  await delay(120);
  // Real lab data first — it is the credible one, the rest are synthetic.
  return [REAL_DATASET_SUMMARY, ...mock.listDatasets()];
}

export async function getDataset(id: string): Promise<CanonicalDataset> {
  await delay(200);
  if (isRealDataset(id)) return loadRealDataset();
  return mock.getDataset(id);
}

export async function addCustomDataset(
  dataset: CanonicalDataset,
  summary: DatasetSummary,
  truthSoc?: number[]
): Promise<void> {
  await delay(100);
  mock.addCustomDataset(dataset, summary, truthSoc);
}

export async function listModels(): Promise<ModelDescriptor[]> {
  await delay(80);
  return mock.listModels();
}

// ---- run lifecycle --------------------------------------------------------
//
// The mock simulates an async job: createRun registers it, getRun reports
// progress that advances with wall-clock time, and getRunResult returns the
// computed estimate once "done". This mirrors the real submit/poll/fetch flow.

interface MockJob {
  job: RunJob;
  request: RunRequest;
  startedAt: number;
  durationMs: number;
  result?: RunResult;
}

const jobs = new Map<string, MockJob>();

export async function createRun(request: RunRequest): Promise<RunJob> {
  await delay(150);
  const id = `run_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
  const job: RunJob = {
    id,
    status: 'running',
    progress: 0,
    message: 'Parameterizing model…',
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, { job, request, startedAt: Date.now(), durationMs: 2600 });
  return { ...job };
}

export async function getRun(id: string): Promise<RunJob> {
  await delay(120);
  const entry = jobs.get(id);
  if (!entry) throw new Error(`Unknown run: ${id}`);

  const elapsed = Date.now() - entry.startedAt;
  const progress = Math.min(1, elapsed / entry.durationMs);

  if (progress >= 1 && entry.job.status !== 'succeeded') {
    // Real datasets replay a result the Simulink model already produced
    // offline; synthetic ones are computed here in the browser.
    const result = isRealDataset(entry.request.datasetId)
      ? { ...(await loadRealResult()) }
      : mock.runEstimator(mock.getDataset(entry.request.datasetId), entry.request.config);
    result.jobId = id;
    entry.result = result;
    entry.job = { ...entry.job, status: 'succeeded', progress: 1, message: 'Done' };
  } else if (entry.job.status === 'running') {
    entry.job = {
      ...entry.job,
      progress,
      message: progress < 0.4 ? 'Parameterizing model…' : 'Running EKF over time series…',
    };
  }
  return { ...entry.job };
}

export async function getRunResult(id: string): Promise<RunResult> {
  await delay(120);
  const entry = jobs.get(id);
  if (!entry?.result) throw new Error(`Result not ready for run: ${id}`);
  return entry.result;
}

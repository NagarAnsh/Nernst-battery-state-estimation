/**
 * API + data contract for the Battery State-Estimation Platform.
 *
 * This file is the single source of truth the frontend and (future) FastAPI
 * backend agree on. It encodes two things from the project diary:
 *   1. The canonical time-series data contract (diary §5).
 *   2. The estimator interface: parameterize/fit -> estimate (diary §5).
 *
 * The backend implements these exact shapes as JSON. When we swap the mock
 * client for real HTTP, nothing else in the app changes.
 */

// ---------------------------------------------------------------------------
// 1. Canonical dataset (every data source is normalized into this)
// ---------------------------------------------------------------------------

export type Chemistry = 'NMC' | 'LFP' | 'NCA' | 'LCO' | 'LTO' | 'unknown';
export type FormFactor = 'cylindrical' | 'prismatic' | 'pouch' | 'pack' | 'unknown';

export interface CanonicalMetadata {
  chemistry: Chemistry;
  nominalCapacityAh: number | null;
  formFactor: FormFactor;
  /** Series/parallel topology, e.g. "1S1P", "96S2P". */
  topology: string | null;
  /** Test protocol, e.g. "DST", "US06", "1C-CC". */
  protocol: string | null;
  /** Dataset name, or "upload:<filename>". */
  source: string;
  sampleCount: number;
  durationS: number | null;
}

/**
 * Column-oriented time series (parallel arrays share one index).
 * Sign convention: current_A > 0 = charge, < 0 = discharge.
 */
export interface CanonicalTimeSeries {
  t: number[]; // seconds since start
  current_A: number[];
  voltage_V: number[];
  temperature_C: (number | null)[];
  // optional channels
  cycleIndex?: number[];
  stepType?: string[];
  capacityThroughput_Ah?: number[];
}

export interface CanonicalDataset {
  id: string;
  metadata: CanonicalMetadata;
  series: CanonicalTimeSeries;
}

/** Lightweight listing entry (no heavy series payload). */
export interface DatasetSummary {
  id: string;
  label: string;
  source: string;
  chemistry: Chemistry;
  nominalCapacityAh: number | null;
  sampleCount: number;
  builtIn: boolean;
}

// ---------------------------------------------------------------------------
// 2. Upload + column mapping (absorbs arbitrary Excel/CSV heterogeneity)
// ---------------------------------------------------------------------------

export type CanonicalChannel =
  | 't'
  | 'current_A'
  | 'voltage_V'
  | 'temperature_C'
  | 'cycleIndex'
  | 'ignore';

export interface UploadPreview {
  uploadId: string;
  filename: string;
  columns: string[];
  /** First N rows, as raw strings, for the mapping UI. */
  sampleRows: string[][];
  /** Adapter's best-guess mapping the user can accept or override. */
  suggestedMapping: Record<string, CanonicalChannel>;
}

export type ColumnMapping = Record<string, CanonicalChannel>;

// ---------------------------------------------------------------------------
// 3. Models + estimator configuration
// ---------------------------------------------------------------------------

export type ModelId = 'ecm_ekf' | 'ml' | 'pybamm';
export type EstimationTarget = 'SoC' | 'SoH' | 'RUL' | 'voltage' | 'thermal';

export interface ModelDescriptor {
  id: ModelId;
  name: string;
  /** false = "coming soon"; UI shows it disabled. */
  available: boolean;
  supportedTargets: EstimationTarget[];
  description: string;
}

export interface EstimatorConfig {
  modelId: ModelId;
  targets: EstimationTarget[];
  /** Gates full estimation behind a known chemistry preset (diary §8). */
  chemistryPreset: Chemistry;
  /** Model-specific parameters (e.g. R0, initial SoC guess). */
  params: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// 4. Run lifecycle (async job: submit -> poll -> fetch result)
// ---------------------------------------------------------------------------

export interface RunRequest {
  datasetId: string;
  config: EstimatorConfig;
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface RunJob {
  id: string;
  status: RunStatus;
  /** 0..1 */
  progress: number;
  message?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 5. Estimator output (time-aligned estimate + uncertainty + metrics)
// ---------------------------------------------------------------------------

export interface EstimateSeries {
  t: number[];
  value: number[];
  /** 1-sigma uncertainty band, if the model reports it. */
  sigma?: number[];
  /** Ground-truth reference when the dataset provides it. */
  reference?: number[];
}

export interface Metric {
  name: string;
  value: number;
  unit: string;
}

export interface Provenance {
  modelId: ModelId;
  modelVersion: string;
  datasetId: string;
  params: Record<string, unknown>;
  finishedAt: string;
  runtimeMs: number;
}

export interface RunResult {
  jobId: string;
  primaryTarget: EstimationTarget;
  estimates: Partial<Record<EstimationTarget, EstimateSeries>>;
  metrics: Metric[];
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// 6. Identified ECM parameters (the "parameterize" half of the estimator)
// ---------------------------------------------------------------------------

/**
 * Look-up curves produced by parameter identification on a characterization
 * test, indexed by SoC. This is what an ECM is *fitted* to before it can
 * estimate anything — exposing it is how we show the work rather than just
 * asserting an accuracy number.
 */
export interface EcmParameterCurves {
  soc_pct: number[];
  ocv_V: number[];
  Ri_mohm: number[];
  Rdiff_mohm: number[];
  Cdiff_F: number[];
  note?: string;
}

// ---------------------------------------------------------------------------
// 7. Measured per-cycle discharge curves (raw evidence, nothing modelled)
// ---------------------------------------------------------------------------

/** One constant-current discharge: terminal voltage vs capacity drawn out. */
export interface DischargeCycle {
  index: number;
  capacityAh: number;
  durationS: number;
  /** Discharged capacity, Ah (x axis). */
  ah: number[];
  /** Terminal voltage, V (y axis). Same length as `ah`. */
  v: number[];
  /**
   * End-of-discharge window at much finer resolution. Cycles are visually
   * identical until the last couple of amp-hours, so a magnified view needs
   * denser samples than the full curve carries.
   */
  tailAh: number[];
  tailV: number[];
}

export interface CycleCurves {
  datasetId: string;
  label: string;
  nominalCapacityAh: number;
  xLabel: string;
  yLabel: string;
  /** Width, in Ah, of the high-resolution tail each cycle carries. */
  tailWindowAh: number;
  note?: string;
  cycles: DischargeCycle[];
}

// ---------------------------------------------------------------------------
// 8. Temperature dependence (same cell, several chamber temperatures)
// ---------------------------------------------------------------------------

/** One HPPC run: the identified impedance of the cell at one temperature. */
export interface TemperaturePoint {
  /** Temperature actually measured at the cell. This is the honest label. */
  T_meas_C: number;
  /** Chamber setpoint. Kept so a gap against T_meas_C stays visible. */
  T_setpoint_C: number;
  label: string;
  Q_Ah: number;
  /** Capacity relative to the reference temperature. */
  Q_rel: number;
  R0_median_mohm: number;
  /** R0 relative to the reference temperature — the headline number. */
  R0_rel: number;
  soc_pct: number[];
  R0_mohm: number[];
  /** Lowest SoC this run actually covers. */
  socFloor_pct: number;
  /** True when the run used a reduced pulse matrix and covers less ground. */
  sparse: boolean;
}

export interface TemperatureSweep {
  cellLabel: string;
  test: string;
  referenceT_C: number;
  xLabel: string;
  yLabel: string;
  note?: string;
  caveat?: string;
  temps: TemperaturePoint[];
}

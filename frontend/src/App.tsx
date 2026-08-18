import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createRun } from './api/client';
import type { EstimatorConfig } from './types/contract';
import { Stepper, type Step } from './components/Stepper';
import { DataStage } from './components/stages/DataStage';
import { InspectStage } from './components/stages/InspectStage';
import { ConfigureStage } from './components/stages/ConfigureStage';
import { RunStage } from './components/stages/RunStage';
import { ResultsStage } from './components/stages/ResultsStage';
import { Landing } from './components/landing/Landing';
import './App.css';

const STEPS: Step[] = [
  { key: 'data', label: 'Data' },
  { key: 'inspect', label: 'Inspect' },
  { key: 'configure', label: 'Configure' },
  { key: 'run', label: 'Run' },
  { key: 'results', label: 'Results' },
];

const DEFAULT_CONFIG: EstimatorConfig = {
  modelId: 'ecm_ekf',
  targets: ['SoC'],
  chemistryPreset: 'NMC',
  params: { initialSoC: 0.7, R0: 0.045 },
};

export default function App() {
  const [view, setView] = useState<'landing' | 'platform'>('landing');
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [config, setConfig] = useState<EstimatorConfig>(DEFAULT_CONFIG);
  const [runId, setRunId] = useState<string | null>(null);

  const goto = useCallback((i: number) => {
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
  }, []);

  const runMutation = useMutation({
    mutationFn: createRun,
    onSuccess: (job) => {
      setRunId(job.id);
      goto(3);
    },
  });

  const startRun = () => {
    if (!datasetId) return;
    runMutation.mutate({ datasetId, config });
  };

  const reset = () => {
    setRunId(null);
    setConfig(DEFAULT_CONFIG);
    setDatasetId(null);
    setMaxReached(0);
    setStep(0);
  };

  if (view === 'landing') {
    return <Landing onLaunch={() => setView('platform')} />;
  }

  return (
    <div className="app">
      <header className="app__header">
        <button className="brand brand--btn" onClick={() => setView('landing')} aria-label="Back to site">
          <span className="brand__mark">⎓</span>
          <div>
            <h1 className="brand__title">Nernst · Platform</h1>
            <p className="brand__sub">Pluggable estimation &amp; benchmarking</p>
          </div>
        </button>
        <span className="env-badge">demo · mock backend</span>
      </header>

      <Stepper steps={STEPS} current={step} maxReached={maxReached} onSelect={goto} />

      <main className="app__main">
        {step === 0 && <DataStage datasetId={datasetId} onSelect={(id) => setDatasetId(id)} />}
        {step === 1 && datasetId && <InspectStage datasetId={datasetId} />}
        {step === 2 && <ConfigureStage config={config} onChange={setConfig} />}
        {step === 3 && runId && <RunStage runId={runId} onDone={() => goto(4)} />}
        {step === 4 && runId && <ResultsStage runId={runId} />}
      </main>

      {step !== 3 && (
        <footer className="app__footer">
          <button className="btn btn--ghost" disabled={step === 0} onClick={() => goto(step - 1)}>
            Back
          </button>

          {step === 0 && (
            <button className="btn btn--primary" disabled={!datasetId} onClick={() => goto(1)}>
              Inspect signals →
            </button>
          )}
          {step === 1 && (
            <button className="btn btn--primary" onClick={() => goto(2)}>
              Configure model →
            </button>
          )}
          {step === 2 && (
            <button className="btn btn--primary" disabled={runMutation.isPending} onClick={startRun}>
              {runMutation.isPending ? 'Submitting…' : 'Run estimation ▸'}
            </button>
          )}
          {step === 4 && (
            <button className="btn btn--primary" onClick={reset}>
              Run another
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

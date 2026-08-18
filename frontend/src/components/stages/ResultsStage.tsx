import { useQuery } from '@tanstack/react-query';
import { getRunResult } from '../../api/client';
import { SoCChart } from '../charts/SoCChart';

interface Props {
  runId: string;
}

export function ResultsStage({ runId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['runResult', runId],
    queryFn: () => getRunResult(runId),
  });

  if (isLoading) return <section className="stage"><p className="muted">Fetching result…</p></section>;
  if (isError || !data) return <section className="stage"><p className="error">Failed to load result.</p></section>;

  const primaryTarget = data.primaryTarget;
  const estimate = data.estimates[primaryTarget];
  const p = data.provenance;

  return (
    <section className="stage">
      <h2 className="stage__title">Results — {primaryTarget}</h2>

      <div className="metric-row">
        {data.metrics.map((m) => (
          <div key={m.name} className="metric">
            <div className="metric__value">{m.value}<span className="metric__unit">{m.unit}</span></div>
            <div className="metric__name">{m.name}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        {estimate ? <SoCChart estimate={estimate} target={primaryTarget} /> : <p className="muted">No estimate returned for {primaryTarget}.</p>}
      </div>

      <div className="provenance">
        <h3 className="subhead">Provenance</h3>
        <div className="meta-row">
          <span><b>Model</b> {p.modelId} ({p.modelVersion})</span>
          <span><b>Dataset</b> {p.datasetId}</span>
          <span><b>Runtime</b> {p.runtimeMs} ms</span>
          <span><b>Finished</b> {new Date(p.finishedAt).toLocaleTimeString()}</span>
        </div>
        <code className="params">{JSON.stringify(p.params)}</code>
      </div>
    </section>
  );
}

import { useQuery } from '@tanstack/react-query';
import { getDataset } from '../../api/client';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';

interface Props {
  datasetId: string;
}

export function InspectStage({ datasetId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId),
  });

  if (isLoading) return <section className="stage"><p className="muted">Loading time series…</p></section>;
  if (isError || !data) return <section className="stage"><p className="error">Failed to load dataset.</p></section>;

  const m = data.metadata;
  return (
    <section className="stage">
      <h2 className="stage__title">Inspect signals</h2>
      <p className="stage__hint">
        A quick sanity check that the data landed correctly in canonical form before estimation.
      </p>

      <div className="meta-row">
        <span><b>Source</b> {m.source}</span>
        <span><b>Chemistry</b> {m.chemistry}</span>
        <span><b>Capacity</b> {m.nominalCapacityAh ?? '—'} Ah</span>
        <span><b>Protocol</b> {m.protocol ?? '—'}</span>
        <span><b>Samples</b> {m.sampleCount.toLocaleString()}</span>
        <span><b>Duration</b> {m.durationS ? `${m.durationS}s` : '—'}</span>
      </div>

      <div className="panel">
        <TimeSeriesChart series={data.series} />
      </div>
    </section>
  );
}

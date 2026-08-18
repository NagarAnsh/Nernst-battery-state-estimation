import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRun } from '../../api/client';

interface Props {
  runId: string;
  onDone: () => void;
}

export function RunStage({ runId, onDone }: Props) {
  const { data: job } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRun(runId),
    refetchInterval: (query) => (query.state.data?.status === 'succeeded' ? false : 300),
    // Keep polling the job even if the user switches to another tab.
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (job?.status === 'succeeded') {
      const id = setTimeout(onDone, 500);
      return () => clearTimeout(id);
    }
  }, [job?.status, onDone]);

  const pct = Math.round((job?.progress ?? 0) * 100);

  return (
    <section className="stage stage--center">
      <h2 className="stage__title">Running estimation</h2>
      <div className="progress">
        <div className="progress__bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="run-status">
        {job?.status === 'succeeded' ? 'Complete — opening results…' : job?.message ?? 'Submitting…'}
      </p>
      <p className="muted small">{pct}%</p>
    </section>
  );
}

import Plot from 'react-plotly.js';
import type { CanonicalTimeSeries } from '../../types/contract';

const AXIS = '#6e6e73';
const GRID = 'rgba(0,0,0,0.08)';

interface Props {
  series: CanonicalTimeSeries;
}

/** Terminal voltage, current, and temperature vs time (shared x-axis). */
export function TimeSeriesChart({ series }: Props) {
  const t = series.t;
  return (
    <Plot
      data={[
        { x: t, y: series.voltage_V, name: 'Voltage (V)', type: 'scattergl', mode: 'lines', line: { color: '#0071e3', width: 1.4 }, yaxis: 'y' },
        { x: t, y: series.current_A, name: 'Current (A)', type: 'scattergl', mode: 'lines', line: { color: '#e08600', width: 1.2 }, yaxis: 'y2' },
        { x: t, y: series.temperature_C, name: 'Temp (°C)', type: 'scattergl', mode: 'lines', line: { color: '#d1435b', width: 1.2 }, yaxis: 'y3' },
      ]}
      layout={{
        autosize: true,
        height: 420,
        margin: { l: 55, r: 55, t: 20, b: 40 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: AXIS, size: 11 },
        showlegend: true,
        legend: { orientation: 'h', y: 1.12 },
        xaxis: { title: { text: 'Time (s)' }, gridcolor: GRID, zeroline: false },
        yaxis: { title: { text: 'Voltage (V)' }, gridcolor: GRID, zeroline: false },
        yaxis2: { title: { text: 'Current (A)' }, overlaying: 'y', side: 'right', showgrid: false, zeroline: false },
        yaxis3: { overlaying: 'y', side: 'right', position: 0.97, showgrid: false, showticklabels: false, zeroline: false },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}

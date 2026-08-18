import Plot from 'react-plotly.js';
import type { Data } from 'plotly.js';
import type { EstimateSeries, EstimationTarget } from '../../types/contract';

const AXIS = '#6e6e73';
const GRID = 'rgba(0,0,0,0.08)';

interface Props {
  estimate: EstimateSeries;
  target: EstimationTarget;
}

/** Predicted-vs-actual estimation overlay with a 1-sigma uncertainty band. */
export function SoCChart({ estimate, target }: Props) {
  const { t, value, sigma, reference } = estimate;

  // Configuration mapping based on target
  let yLabel = 'Value';
  let estName = 'Estimate';
  let refName = 'Reference';
  let yRange: [number, number] | undefined = undefined;
  let scale = (x: number) => x;

  switch (target) {
    case 'SoC':
      yLabel = 'State of Charge (%)';
      estName = 'Estimated SoC';
      refName = 'Reference SoC';
      yRange = [0, 100];
      scale = (x: number) => x * 100;
      break;
    case 'SoH':
      yLabel = 'State of Health (%)';
      estName = 'Estimated SoH';
      refName = 'Reference SoH';
      yRange = [80, 100];
      scale = (x: number) => x * 100;
      break;
    case 'RUL':
      yLabel = 'Remaining Useful Life (cycles)';
      estName = 'Estimated RUL';
      refName = 'Reference RUL';
      break;
    case 'voltage':
      yLabel = 'Terminal Voltage (V)';
      estName = 'Simulated Voltage';
      refName = 'Actual Voltage';
      break;
    case 'thermal':
      yLabel = 'Cell Temperature (°C)';
      estName = 'Simulated Temp';
      refName = 'Actual Temp';
      break;
  }

  const scaledVal = value.map(scale);
  const traces: Data[] = [];

  if (sigma) {
    const upper = value.map((v, i) => scale(v + sigma[i]));
    const lower = value.map((v, i) => scale(v - sigma[i]));
    traces.push(
      { x: t, y: upper, type: 'scattergl', mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
      { x: t, y: lower, type: 'scattergl', mode: 'lines', line: { width: 0 }, fill: 'tonexty', fillcolor: 'rgba(0,113,227,0.12)', hoverinfo: 'skip', name: '±1σ' },
    );
  }
  if (reference) {
    const scaledRef = reference.map(scale);
    traces.push({ x: t, y: scaledRef, type: 'scattergl', mode: 'lines', name: refName, line: { color: '#86868b', width: 1.6, dash: 'dot' } });
  }
  traces.push({ x: t, y: scaledVal, type: 'scattergl', mode: 'lines', name: estName, line: { color: '#0071e3', width: 2 } });

  return (
    <Plot
      data={traces}
      layout={{
        autosize: true,
        height: 420,
        margin: { l: 55, r: 20, t: 20, b: 40 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: AXIS, size: 11 },
        legend: { orientation: 'h', y: 1.12 },
        xaxis: { title: { text: 'Time (s)' }, gridcolor: GRID, zeroline: false },
        yaxis: { title: { text: yLabel }, gridcolor: GRID, zeroline: false, range: yRange },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}

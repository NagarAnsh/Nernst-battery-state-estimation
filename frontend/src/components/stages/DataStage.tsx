import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listDatasets, addCustomDataset } from '../../api/client';
import type { Chemistry, CanonicalDataset, DatasetSummary, CanonicalChannel } from '../../types/contract';

interface Props {
  datasetId: string | null;
  onSelect: (id: string) => void;
}

export function DataStage({ datasetId, onSelect }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['datasets'], queryFn: listDatasets });

  const [mode, setMode] = useState<'select' | 'configure'>('select');
  const [filename, setFilename] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, CanonicalChannel>>({});
  
  // Metadata fields
  const [label, setLabel] = useState('');
  const [chemistry, setChemistry] = useState<Chemistry>('NMC');
  const [capacity, setCapacity] = useState<number>(2.5);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    setLabel(file.name.replace(/\.csv$/i, ''));

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const { headers: parsedHeaders, rows: parsedRows } = parseCSV(text);
      
      setHeaders(parsedHeaders);
      setRows(parsedRows);
      
      // Auto-suggest mapping
      const suggested = getSuggestedMapping(parsedHeaders);
      setMapping(suggested);
      
      setMode('configure');
    };
    reader.readAsText(file);
  };

  const handleConfirm = async () => {
    // Process full dataset
    const mappedT: number[] = [];
    const mappedI: number[] = [];
    const mappedV: number[] = [];
    const mappedTemp: (number | null)[] = [];
    const mappedCycle: number[] = [];

    const tCol = headers.findIndex(h => mapping[h] === 't');
    const iCol = headers.findIndex(h => mapping[h] === 'current_A');
    const vCol = headers.findIndex(h => mapping[h] === 'voltage_V');
    const tempCol = headers.findIndex(h => mapping[h] === 'temperature_C');
    const cycleCol = headers.findIndex(h => mapping[h] === 'cycleIndex');

    rows.forEach((row, rowIndex) => {
      if (row.length < Math.max(tCol, iCol, vCol)) return;

      let valT = tCol !== -1 ? parseFloat(row[tCol]) : rowIndex;
      if (isNaN(valT)) valT = rowIndex;

      let valI = iCol !== -1 ? parseFloat(row[iCol]) : -1.0;
      if (isNaN(valI)) valI = 0;

      let valV = vCol !== -1 ? parseFloat(row[vCol]) : 3.7;
      if (isNaN(valV)) valV = 3.7;

      let valTemp: number | null = tempCol !== -1 ? parseFloat(row[tempCol]) : 25.0;
      if (valTemp !== null && isNaN(valTemp)) valTemp = null;

      mappedT.push(valT);
      mappedI.push(valI);
      mappedV.push(valV);
      mappedTemp.push(valTemp);
      if (cycleCol !== -1) {
        let valCycle = parseInt(row[cycleCol], 10);
        if (!isNaN(valCycle)) mappedCycle.push(valCycle);
      }
    });

    // Generate a plausible true SoC reference using Coulomb Counting
    const capacityAs = capacity * 3600;
    const socTrue: number[] = new Array(mappedT.length);
    let currentSoc = 0.95;
    socTrue[0] = currentSoc;

    for (let k = 1; k < mappedT.length; k++) {
      const dt = mappedT[k] - mappedT[k - 1];
      // Current sign convention: current_A > 0 = charge, < 0 = discharge.
      const i = mappedI[k];
      currentSoc = Math.min(1, Math.max(0, currentSoc + (i * dt) / capacityAs));
      socTrue[k] = currentSoc;
    }

    const id = `upload_${Date.now()}`;
    const newDataset: CanonicalDataset = {
      id,
      metadata: {
        chemistry,
        nominalCapacityAh: capacity,
        formFactor: 'unknown',
        topology: null,
        protocol: 'custom upload',
        source: 'upload',
        sampleCount: mappedT.length,
        durationS: mappedT[mappedT.length - 1] - mappedT[0],
      },
      series: {
        t: mappedT,
        current_A: mappedI,
        voltage_V: mappedV,
        temperature_C: mappedTemp,
        cycleIndex: mappedCycle.length ? mappedCycle : undefined,
      }
    };

    const summary: DatasetSummary = {
      id,
      label,
      source: 'upload',
      chemistry,
      nominalCapacityAh: capacity,
      sampleCount: mappedT.length,
      builtIn: false,
    };

    await addCustomDataset(newDataset, summary, socTrue);
    await queryClient.invalidateQueries({ queryKey: ['datasets'] });
    onSelect(id);
    setMode('select');
  };

  const handleMappingChange = (header: string, channel: CanonicalChannel) => {
    setMapping(prev => ({ ...prev, [header]: channel }));
  };

  // Validation
  const mappedChannels = Object.values(mapping);
  const hasV = mappedChannels.includes('voltage_V');
  const hasI = mappedChannels.includes('current_A');
  const duplicateChannels = mappedChannels.filter((c, idx) => c !== 'ignore' && mappedChannels.indexOf(c) !== idx);
  const isValid = hasV && hasI && duplicateChannels.length === 0;

  if (mode === 'configure') {
    return (
      <section className="stage">
        <h2 className="stage__title">Map your dataset: {filename}</h2>
        <p className="stage__hint">
          Match your CSV column headers to the platform's canonical time-series model inputs.
        </p>

        <div className="upload-setup">
          <div className="param-grid" style={{ marginBottom: '24px' }}>
            <label className="param">
              <span>Dataset Label</span>
              <input type="text" value={label} onChange={e => setLabel(e.target.value)} />
            </label>
            <label className="param">
              <span>Chemistry Preset</span>
              <select 
                value={chemistry} 
                onChange={e => setChemistry(e.target.value as Chemistry)}
                style={{ 
                  background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)',
                  color: 'var(--text)', padding: '11px 13px', fontSize: '15px'
                }}
              >
                {['NMC', 'LFP', 'NCA', 'LCO', 'LTO'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="param">
              <span>Nominal Capacity (Ah)</span>
              <input type="number" step={0.1} value={capacity} onChange={e => setCapacity(parseFloat(e.target.value) || 2.0)} />
            </label>
          </div>

          <h3 className="subhead">Column Mapping Selection</h3>
          <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
            <table className="upload-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-strong)' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>CSV Column</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Map To Channel</th>
                  <th style={{ textAlign: 'left', padding: '10px', color: 'var(--muted)' }}>Row 1</th>
                  <th style={{ textAlign: 'left', padding: '10px', color: 'var(--muted)' }}>Row 2</th>
                  <th style={{ textAlign: 'left', padding: '10px', color: 'var(--muted)' }}>Row 3</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={h} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px', fontWeight: '600' }}>{h}</td>
                    <td style={{ padding: '10px' }}>
                      <select 
                        value={mapping[h] || 'ignore'} 
                        onChange={e => handleMappingChange(h, e.target.value as CanonicalChannel)}
                        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-strong)' }}
                      >
                        <option value="ignore">Ignore</option>
                        <option value="t">Time (t)</option>
                        <option value="current_A">Current (current_A)</option>
                        <option value="voltage_V">Voltage (voltage_V)</option>
                        <option value="temperature_C">Temperature (temperature_C)</option>
                        <option value="cycleIndex">Cycle Index (cycleIndex)</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-2)' }}>{rows[0]?.[i] ?? '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--text-2)' }}>{rows[1]?.[i] ?? '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--text-2)' }}>{rows[2]?.[i] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {!hasV && <p className="error" style={{ fontSize: '13px', margin: 0 }}>⚠️ Voltage mapping is required.</p>}
            {!hasI && <p className="error" style={{ fontSize: '13px', margin: 0 }}>⚠️ Current mapping is required.</p>}
            {duplicateChannels.length > 0 && (
              <p className="error" style={{ fontSize: '13px', margin: 0 }}>
                ⚠️ Duplicate mapping found for channel: {duplicateChannels.join(', ')}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn--ghost" onClick={() => setMode('select')}>Cancel</button>
            <button className="btn btn--primary" onClick={handleConfirm} disabled={!isValid}>Confirm &amp; Load Dataset</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="stage">
      <h2 className="stage__title">Choose a dataset</h2>
      <p className="stage__hint">
        Pick a built-in public dataset, or upload your own. Every source is normalized into the
        platform's canonical time-series schema before any model sees it.
      </p>

      {isLoading && <p className="muted">Loading datasets…</p>}
      {isError && <p className="error">Failed to load datasets.</p>}

      <div className="card-grid">
        {data?.map((d) => (
          <button
            key={d.id}
            className={`data-card ${datasetId === d.id ? 'data-card--selected' : ''}`}
            onClick={() => onSelect(d.id)}
          >
            <div className="data-card__label">{d.label}</div>
            <dl className="data-card__meta">
              <div><dt>Chemistry</dt><dd>{d.chemistry}</dd></div>
              <div><dt>Capacity</dt><dd>{d.nominalCapacityAh ?? '—'} Ah</dd></div>
              <div><dt>Samples</dt><dd>{d.sampleCount.toLocaleString()}</dd></div>
            </dl>
          </button>
        ))}

        <label 
          className="data-card" 
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', cursor: 'pointer', textAlign: 'center' }}
        >
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange} 
            style={{ display: 'none' }} 
          />
          <div className="data-card__label" style={{ margin: 0, color: 'var(--accent)' }}>+ Upload CSV File</div>
          <p className="muted small" style={{ marginTop: '8px' }}>Select battery data to map and estimate.</p>
        </label>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function getSuggestedMapping(headers: string[]): Record<string, CanonicalChannel> {
  const mapping: Record<string, CanonicalChannel> = {};
  for (const h of headers) {
    const norm = h.toLowerCase();
    if (norm.includes('time') || norm === 't' || norm.includes('sec') || norm.includes('duration')) {
      mapping[h] = 't';
    } else if (norm.includes('current') || norm === 'i' || norm.includes('amp') || norm === 'a' || norm.includes('curr')) {
      mapping[h] = 'current_A';
    } else if (norm.includes('voltage') || norm === 'v' || norm.includes('volt')) {
      mapping[h] = 'voltage_V';
    } else if (norm.includes('temp') || norm.includes('t_') || norm.includes('celsius') || norm === 'c') {
      mapping[h] = 'temperature_C';
    } else if (norm.includes('cycle') || norm.includes('cyc') || norm.includes('idx')) {
      mapping[h] = 'cycleIndex';
    } else {
      mapping[h] = 'ignore';
    }
  }
  return mapping;
}

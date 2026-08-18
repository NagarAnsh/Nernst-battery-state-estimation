import { useQuery } from '@tanstack/react-query';
import { listModels } from '../../api/client';
import type { Chemistry, EstimatorConfig, ModelId, EstimationTarget } from '../../types/contract';

interface Props {
  config: EstimatorConfig;
  onChange: (next: EstimatorConfig) => void;
}

const CHEMISTRIES: Chemistry[] = ['NMC', 'LFP', 'NCA', 'LCO', 'LTO'];

export function ConfigureStage({ config, onChange }: Props) {
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: listModels });

  const setModel = (id: ModelId) => {
    const targetModel = models?.find(m => m.id === id);
    const defaultTarget = targetModel?.supportedTargets[0] || 'SoC';
    let defaultParams: Record<string, any> = {};
    if (id === 'ecm_ekf') {
      defaultParams = { initialSoC: 0.7, R0: 0.045 };
    } else if (id === 'ml') {
      defaultParams = { initialSoH: 0.95, epochs: 50, learningRate: 0.01 };
    } else if (id === 'pybamm') {
      defaultParams = { initialCellTemp: 25.0, thicknessRatio: 1.0 };
    }
    onChange({
      ...config,
      modelId: id,
      targets: [defaultTarget],
      params: defaultParams,
    });
  };

  const setParam = (k: string, v: number) => onChange({ ...config, params: { ...config.params, [k]: v } });

  const selectedModel = models?.find(m => m.id === config.modelId);
  const supportedTargets = selectedModel?.supportedTargets || [];

  return (
    <section className="stage">
      <h2 className="stage__title">Configure the estimator</h2>
      <p className="stage__hint">
        Select a model and target. The same run is benchmarked head-to-head across models later —
        that comparison view is the platform's headline feature.
      </p>

      <h3 className="subhead">Model</h3>
      <div className="card-grid">
        {models?.map((mdl) => (
          <button
            key={mdl.id}
            className={`model-card ${config.modelId === mdl.id ? 'model-card--selected' : ''} ${!mdl.available ? 'model-card--disabled' : ''}`}
            disabled={!mdl.available}
            onClick={() => mdl.available && setModel(mdl.id)}
          >
            <div className="model-card__head">
              <span className="model-card__name">{mdl.name}</span>
              {!mdl.available && <span className="tag">soon</span>}
            </div>
            <p className="muted small">{mdl.description}</p>
            <div className="chip-row">
              {mdl.supportedTargets.map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
          </button>
        ))}
      </div>

      <h3 className="subhead">Target State</h3>
      <p className="muted small" style={{ marginBottom: '10px' }}>
        Select the dynamic state parameter to estimate with the {selectedModel?.name || ''} model.
      </p>
      <div className="chip-row" style={{ marginBottom: '24px' }}>
        {supportedTargets.map((t) => (
          <button
            key={t}
            className={`chip chip--button ${config.targets.includes(t as EstimationTarget) ? 'chip--active' : ''}`}
            onClick={() => onChange({ ...config, targets: [t as EstimationTarget] })}
          >
            {t}
          </button>
        ))}
      </div>

      <h3 className="subhead">Chemistry preset</h3>
      <p className="muted small">
        Full estimation is gated behind a known chemistry — this supplies the OCV curve and cell
        parameters the ECM needs.
      </p>
      <div className="chip-row" style={{ marginBottom: '24px' }}>
        {CHEMISTRIES.map((c) => (
          <button
            key={c}
            className={`chip chip--button ${config.chemistryPreset === c ? 'chip--active' : ''}`}
            onClick={() => onChange({ ...config, chemistryPreset: c })}
          >
            {c}
          </button>
        ))}
      </div>

      <h3 className="subhead">{selectedModel?.name || ''} parameters</h3>
      <div className="param-grid">
        {config.modelId === 'ecm_ekf' && (
          <>
            <label className="param">
              <span>Initial SoC guess</span>
              <input
                type="number" min={0} max={1} step={0.05}
                value={Number(config.params.initialSoC ?? 0.7)}
                onChange={(e) => setParam('initialSoC', Number(e.target.value))}
              />
              <small className="muted">The EKF should converge even from a wrong guess.</small>
            </label>
            <label className="param">
              <span>Ohmic resistance R₀ (Ω)</span>
              <input
                type="number" min={0} step={0.005}
                value={Number(config.params.R0 ?? 0.045)}
                onChange={(e) => setParam('R0', Number(e.target.value))}
              />
            </label>
          </>
        )}

        {config.modelId === 'ml' && (
          <>
            {config.targets[0] === 'SoH' ? (
              <label className="param">
                <span>Initial SoH guess</span>
                <input
                  type="number" min={0} max={1} step={0.01}
                  value={Number(config.params.initialSoH ?? 0.95)}
                  onChange={(e) => setParam('initialSoH', Number(e.target.value))}
                />
              </label>
            ) : (
              <label className="param">
                <span>Initial RUL guess (cycles)</span>
                <input
                  type="number" min={0} max={2000} step={50}
                  value={Number(config.params.initialRUL ?? 800)}
                  onChange={(e) => setParam('initialRUL', Number(e.target.value))}
                />
              </label>
            )}
            <label className="param">
              <span>Training Epochs</span>
              <input
                type="number" min={1} max={500} step={10}
                value={Number(config.params.epochs ?? 50)}
                onChange={(e) => setParam('epochs', Number(e.target.value))}
              />
            </label>
            <label className="param">
              <span>Learning Rate</span>
              <input
                type="number" min={0.0001} max={0.5} step={0.001}
                value={Number(config.params.learningRate ?? 0.01)}
                onChange={(e) => setParam('learningRate', Number(e.target.value))}
              />
            </label>
          </>
        )}

        {config.modelId === 'pybamm' && (
          <>
            <label className="param">
              <span>Initial Cell Temperature (°C)</span>
              <input
                type="number" min={0} max={60} step={1}
                value={Number(config.params.initialCellTemp ?? 25.0)}
                onChange={(e) => setParam('initialCellTemp', Number(e.target.value))}
              />
            </label>
            <label className="param">
              <span>Electrode Thickness Ratio</span>
              <input
                type="number" min={0.1} max={5.0} step={0.1}
                value={Number(config.params.thicknessRatio ?? 1.0)}
                onChange={(e) => setParam('thicknessRatio', Number(e.target.value))}
              />
            </label>
          </>
        )}
      </div>
    </section>
  );
}

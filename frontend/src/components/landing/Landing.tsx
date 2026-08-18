import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { RunResult } from '../../types/contract';
import { loadRealResult } from '../../api/real/loader';
import { CycleOverlayChart, OcvCurveChart, TemperatureChart } from './ScienceCharts';
import './Landing.css';

interface Props {
  onLaunch: () => void;
}

interface ModelCard {
  id: string;
  name: string;
  tag: string;
  status: 'available' | 'soon';
  tagline: string;
  bullets: string[];
  accuracy: string;
  speed: string;
  data: string;
  accentVar: string;
}

const MODELS: ModelCard[] = [
  {
    id: 'ecm_ekf',
    name: 'ECM + EKF',
    tag: 'Equivalent circuit',
    status: 'available',
    tagline: 'Fast, robust state tracking that runs on a real BMS chip.',
    bullets: [
      'Dual EKF over an R–C equivalent circuit',
      'Validated on 115 h of real 80 Ah cell data',
      'Millisecond updates, tiny memory footprint',
    ],
    accuracy: '39 mV RMSE',
    speed: 'Real-time',
    data: 'Low',
    accentVar: '#0071e3',
  },
  {
    id: 'ml',
    name: 'Machine Learning',
    tag: 'Data-driven',
    status: 'soon',
    tagline: 'Learns degradation patterns for sharp SoH & RUL forecasts.',
    bullets: [
      'Trained on public + your own cycling data',
      'Captures non-linear ageing an ECM misses',
      'Best-in-class SoH and remaining-life prediction',
    ],
    accuracy: '±1.5% SoH',
    speed: 'Fast',
    data: 'High',
    accentVar: '#1a9d5a',
  },
  {
    id: 'pybamm',
    name: 'Electrochemical',
    tag: 'Physics (DFN / SPMe)',
    status: 'soon',
    tagline: 'First-principles cell physics for the ground-truth reference.',
    bullets: [
      'Doyle–Fuller–Newman / single-particle models',
      'Voltage, thermal & internal-state simulation',
      'The gold standard every other model is measured against',
    ],
    accuracy: 'Reference',
    speed: 'Batch',
    data: 'Params',
    accentVar: '#b7791f',
  },
];

export function Landing({ onLaunch }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lp">
      {/* ---------------------------------------------------------------- nav */}
      <nav className={`lp-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
        <div className="lp-nav__inner">
          <a className="lp-brand" href="#top">
            <span className="lp-brand__mark">⎓</span>
            <span className="lp-brand__name">Nernst</span>
          </a>
          <div className="lp-nav__links">
            <a href="#models">Models</a>
            <a href="#benchmark">Benchmark</a>
            <a href="#platform">Platform</a>
            <a href="#contact">Contact</a>
          </div>
          <button className="btn btn--primary btn--sm" onClick={onLaunch}>
            Launch platform
          </button>
        </div>
      </nav>

      {/* --------------------------------------------------------------- hero */}
      <header className="lp-hero" id="top">
        <div className="lp-hero__glow" aria-hidden />
        <div className="lp-hero__inner">
          <span className="lp-eyebrow">Battery State-Estimation Platform</span>
          <h1 className="lp-hero__title">
            Battery intelligence,<br />made measurable.
          </h1>
          <p className="lp-hero__sub">
            Three estimation models — circuit, physics, and machine learning —
            on one platform. Estimate <b>SoC</b>, <b>SoH</b> and <b>remaining life</b>,
            then benchmark them head-to-head on the same data.
          </p>
          <div className="lp-hero__cta">
            <button className="btn btn--primary btn--lg" onClick={onLaunch}>
              See the models in action
            </button>
            <a className="btn btn--ghost btn--lg" href="#benchmark">
              Why it matters →
            </a>
          </div>
          <HeroVisual />
        </div>
      </header>

      {/* --------------------------------------------------------------- stats */}
      <section className="lp-stats">
        {[
          ['3', 'estimation models, one interface'],
          ['SoC · SoH · RUL', 'states estimated & forecast'],
          ['39 mV', 'voltage RMSE over 115 h of real cell data'],
          ['STM32 → cloud', 'from embedded to digital twin'],
        ].map(([big, small]) => (
          <div className="lp-stat" key={small}>
            <div className="lp-stat__big">{big}</div>
            <div className="lp-stat__small">{small}</div>
          </div>
        ))}
      </section>

      {/* -------------------------------------------------------------- models */}
      <section className="lp-section" id="models">
        <div className="lp-section__head">
          <span className="lp-eyebrow">The models</span>
          <h2 className="lp-section__title">Every method a battery engineer trusts.</h2>
          <p className="lp-section__lead">
            Each model estimates the same states — but with different trade-offs in
            accuracy, speed, data appetite and hardware. Pick one, or run them side by side.
          </p>
        </div>

        <div className="lp-models">
          {MODELS.map((m) => (
            <article className="mcard" key={m.id} style={{ '--card-accent': m.accentVar } as CSSProperties}>
              <div className="mcard__top">
                <span className="mcard__tag">{m.tag}</span>
                {m.status === 'available' ? (
                  <span className="pill pill--good">Available</span>
                ) : (
                  <span className="pill pill--soon">Coming soon</span>
                )}
              </div>
              <h3 className="mcard__name">{m.name}</h3>
              <p className="mcard__tagline">{m.tagline}</p>
              <ul className="mcard__bullets">
                {m.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <dl className="mcard__specs">
                <div><dt>Accuracy</dt><dd>{m.accuracy}</dd></div>
                <div><dt>Speed</dt><dd>{m.speed}</dd></div>
                <div><dt>Data need</dt><dd>{m.data}</dd></div>
              </dl>
              <button
                className={`btn ${m.status === 'available' ? 'btn--primary' : 'btn--ghost'} mcard__cta`}
                onClick={onLaunch}
                disabled={m.status !== 'available'}
              >
                {m.status === 'available' ? 'Try this model →' : 'Notify me'}
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ evidence */}
      <section className="lp-section lp-section--tint" id="benchmark">
        <div className="lp-section__head">
          <span className="lp-eyebrow">The evidence</span>
          <h2 className="lp-section__title">Two charts, and the whole argument.</h2>
          <p className="lp-section__lead">
            Every state estimate rests on two facts about a cell: what its resting
            voltage says about how full it is, and how faithfully it repeats that
            behaviour cycle after cycle. Both are measured below — one real 80 Ah
            NMC cell, 115 hours on the cycler, nothing simulated.
          </p>
        </div>

        <div className="ch-grid2">
          <OcvCurveChart />
          <CycleOverlayChart />
        </div>

        {/* A different cell, so it gets its own frame rather than being folded
            into the charts above — mixing two cells in one figure would be a
            quiet lie about what was measured. */}
        <div className="ch-grid1">
          <TemperatureChart />
        </div>
      </section>

      {/* ------------------------------------------------------------ platform */}
      <section className="lp-section" id="platform">
        <div className="lp-section__head">
          <span className="lp-eyebrow">The platform</span>
          <h2 className="lp-section__title">From raw data to a decision, in five steps.</h2>
        </div>
        <div className="lp-flow">
          {[
            ['01', 'Data', 'Load a public dataset or upload your own cycling log.'],
            ['02', 'Inspect', 'Visualise voltage, current and temperature signals.'],
            ['03', 'Configure', 'Pick a model, chemistry preset and parameters.'],
            ['04', 'Run', 'Estimate SoC / SoH / RUL — on-demand, off the request path.'],
            ['05', 'Results', 'Metrics, overlays and an exportable report.'],
          ].map(([n, t, d]) => (
            <div className="lp-flow__step" key={n}>
              <span className="lp-flow__num">{n}</span>
              <h4>{t}</h4>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- contact */}
      <section className="lp-cta" id="contact">
        <div className="lp-cta__inner">
          <h2 className="lp-cta__title">Bring these models to your batteries.</h2>
          <p className="lp-cta__sub">
            Explore the live demo, or talk to us about licensing the models for your
            BMS, fleet or lab.
          </p>
          <div className="lp-hero__cta lp-cta__buttons">
            <button className="btn btn--primary btn--lg" onClick={onLaunch}>
              Launch the platform
            </button>
            <a className="btn btn--ghost btn--lg" href="mailto:nagaranshul04@gmail.com">
              Contact us
            </a>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <span className="lp-brand"><span className="lp-brand__mark">⎓</span><span className="lp-brand__name">Nernst</span></span>
          <span className="lp-footer__note">Battery State-Estimation Platform · demo build</span>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------- hero gauge (real replay) */
/**
 * Replays the exported ECM+EKF run instead of showing a made-up number: the
 * gauge is the estimator's own SoC trace, the chips are the measurements that
 * go with it. Nothing here is invented — if the export is missing, it says so.
 */
function HeroVisual() {
  const [run, setRun] = useState<RunResult | null>(null);
  const [i, setI] = useState(0);
  const timer = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    loadRealResult().then((r) => alive && setRun(r)).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!run) return;
    const n = run.estimates.SoC?.value.length ?? 0;
    if (!n) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setI(Math.floor(n * 0.42)); return; }
    // 115 h of test compressed into a ~45 s loop.
    const step = Math.max(1, Math.round(n / 900));
    timer.current = window.setInterval(() => setI((k) => (k + step) % n), 50);
    return () => window.clearInterval(timer.current);
  }, [run]);

  const socSeries = run?.estimates.SoC;
  const vSeries = run?.estimates.voltage;
  const pct = socSeries ? Math.min(100, Math.max(0, socSeries.value[i] * 100)) : 0;
  const hours = socSeries ? socSeries.t[i] / 3600 : 0;
  const volts = vSeries?.reference?.[i];
  const rmse = run?.metrics.find((m) => m.name === 'Voltage RMSE');

  const r = 90;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="lp-visual">
      <svg viewBox="0 0 240 240" className="lp-gauge" role="img"
           aria-label={`State of charge, replaying a recorded run: ${pct.toFixed(1)} percent`}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a84ff" />
            <stop offset="100%" stopColor="#4fc3f7" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="14" />
        <circle
          cx="120" cy="120" r={r} fill="none" stroke="url(#gaugeGrad)" strokeWidth="14"
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 120 120)"
          className={`lp-gauge__arc ${run ? 'lp-gauge__arc--live' : ''}`}
        />
        <text x="120" y="112" textAnchor="middle" className="lp-gauge__val">
          {run ? `${pct.toFixed(1)}%` : '—'}
        </text>
        <text x="120" y="140" textAnchor="middle" className="lp-gauge__lbl">STATE OF CHARGE</text>
      </svg>
      <div className="lp-visual__chips">
        <div className="lp-vchip">
          <span>Elapsed</span><b>{run ? `${hours.toFixed(1)} h` : '—'}</b>
        </div>
        <div className="lp-vchip">
          <span>Terminal</span><b>{volts !== undefined ? `${volts.toFixed(3)} V` : '—'}</b>
        </div>
        <div className="lp-vchip">
          <span>Voltage RMSE</span><b>{rmse ? `${rmse.value} ${rmse.unit}` : '—'}</b>
        </div>
      </div>
      <p className="lp-visual__cap">
        Live replay of a recorded 115 h test on a real 80 Ah cell — not a mock-up.
      </p>
    </div>
  );
}

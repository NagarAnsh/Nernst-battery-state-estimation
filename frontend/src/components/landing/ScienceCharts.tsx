/**
 * The two charts the landing page argues from. Both are drawn from files
 * exported by MATLAB (`ECM-EKF/export_to_web.m`, `export_cycles.m`) — measured
 * or identified numbers only, nothing synthesised in the browser.
 *
 *   OcvCurveChart     — the identified OCV(SoC) look-up the ECM is fitted to.
 *   CycleOverlayChart — every measured discharge of the cell, in one frame.
 *
 * Deliberately dependency-free SVG: these render in the first paint, print
 * cleanly, and cost nothing in bundle size.
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type {
  CycleCurves,
  DischargeCycle,
  EcmParameterCurves,
  TemperatureSweep,
} from '../../types/contract';
import { loadCycleCurves, loadParamCurves, loadTemperatureSweep } from '../../api/real/loader';
import './ScienceCharts.css';

// ---------------------------------------------------------------- geometry

const W = 620;
const H = 400;

/**
 * SVG text scales with the viewBox, so on a phone the whole chart is drawn at
 * roughly 0.45x and desktop-sized labels stop being legible. The CSS bumps the
 * in-SVG type on small screens; the margins have to grow with it or the tick
 * labels run into the axis titles.
 */
interface Geom {
  compact: boolean;
  pad: { l: number; r: number; t: number; b: number };
  plotW: number;
  plotH: number;
  /** gap between an axis and its tick labels */
  tickGap: number;
}

const COMPACT_Q = '(max-width: 700px)';

function geomFor(compact: boolean): Geom {
  const pad = compact
    ? { l: 84, r: 18, t: 20, b: 80 }
    : { l: 60, r: 22, t: 22, b: 52 };
  return {
    compact,
    pad,
    plotW: W - pad.l - pad.r,
    plotH: H - pad.t - pad.b,
    tickGap: compact ? 12 : 10,
  };
}

// Subscribing in an effect would miss a viewport change that lands between the
// first render and the effect, leaving the chart stuck in the wrong geometry.
// useSyncExternalStore closes that gap.
const subscribeCompact = (onChange: () => void) => {
  const mq = window.matchMedia(COMPACT_Q);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

function useGeom(): Geom {
  const compact = useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_Q).matches,
    () => false
  );
  return useMemo(() => geomFor(compact), [compact]);
}

interface Scale {
  x: (v: number) => number;
  y: (v: number) => number;
  /** inverse of x, for hit-testing the pointer */
  xInv: (px: number) => number;
  xTicks: number[];
  yTicks: number[];
}

function makeScale(
  g: Geom, x0: number, x1: number, y0: number, y1: number, nx = 5, ny = 5
): Scale {
  const x = (v: number) => g.pad.l + ((v - x0) / (x1 - x0)) * g.plotW;
  const y = (v: number) => g.pad.t + (1 - (v - y0) / (y1 - y0)) * g.plotH;
  const ticks = (a: number, b: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  return {
    x,
    y,
    xInv: (px: number) => x0 + ((px - g.pad.l) / g.plotW) * (x1 - x0),
    xTicks: ticks(x0, x1, nx),
    yTicks: ticks(y0, y1, ny),
  };
}

const line = (xs: number[], ys: number[], s: Scale) =>
  xs.map((v, i) => `${i ? 'L' : 'M'}${s.x(v).toFixed(2)},${s.y(ys[i]).toFixed(2)}`).join('');

/** Pointer position in viewBox units, so hit-testing survives any CSS size. */
function svgX(e: React.PointerEvent<SVGSVGElement>): number {
  const r = e.currentTarget.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width) * W;
}

/** Linear interpolation of ys at x, assuming xs ascending. */
function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

// ------------------------------------------------------------ chart chrome

function Axes({ g, s, xLabel, yLabel, xFmt, yFmt }: {
  g: Geom;
  s: Scale;
  xLabel: string;
  yLabel: string;
  xFmt: (v: number) => string;
  yFmt: (v: number) => string;
}) {
  const baseline = H - g.pad.b;
  return (
    <g className="ch-axes">
      {s.yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={g.pad.l} x2={W - g.pad.r} y1={s.y(v)} y2={s.y(v)} className="ch-grid" />
          <text x={g.pad.l - g.tickGap} y={s.y(v)} className="ch-tick ch-tick--y">{yFmt(v)}</text>
        </g>
      ))}
      {s.xTicks.map((v) => (
        <text
          key={`x${v}`}
          x={s.x(v)}
          y={baseline + (g.compact ? 32 : 22)}
          className="ch-tick ch-tick--x"
        >
          {xFmt(v)}
        </text>
      ))}
      <line x1={g.pad.l} x2={W - g.pad.r} y1={baseline} y2={baseline} className="ch-axis" />
      <text x={g.pad.l + g.plotW / 2} y={H - 8} className="ch-alabel">{xLabel}</text>
      <text
        transform={`translate(${g.compact ? 20 : 16} ${g.pad.t + g.plotH / 2}) rotate(-90)`}
        className="ch-alabel"
      >
        {yLabel}
      </text>
    </g>
  );
}

function ChartCard({ eyebrow, title, sub, children, footer }: {
  eyebrow: string;
  title: string;
  sub: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <figure className="ch-card">
      <figcaption className="ch-card__head">
        <span className="ch-card__eyebrow">{eyebrow}</span>
        <h3 className="ch-card__title">{title}</h3>
        <p className="ch-card__sub">{sub}</p>
      </figcaption>
      <div className="ch-card__plot">{children}</div>
      {footer && <div className="ch-card__foot">{footer}</div>}
    </figure>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="ch-loading" role="status">
      <span className="ch-loading__bar" />
      {label}
    </div>
  );
}

// --------------------------------------------------------- 1. OCV vs SoC

export function OcvCurveChart() {
  const [pc, setPc] = useState<EcmParameterCurves | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const g = useGeom();

  useEffect(() => {
    let alive = true;
    loadParamCurves().then((d) => alive && setPc(d)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const s = useMemo(() => {
    if (!pc) return null;
    // Snap the axis to whole multiples of the tick step, or the labels come out
    // as 3.3 / 3.5 / 3.7 / 3.8. A phone gets the coarser step.
    const step = g.compact ? 0.2 : 0.1;
    const lo = Math.floor(Math.min(...pc.ocv_V) / step) * step;
    const hi = Math.ceil(Math.max(...pc.ocv_V) / step) * step;
    const ny = Math.round((hi - lo) / step);
    return makeScale(g, 0, 100, lo, hi, g.compact ? 4 : 5, ny);
  }, [pc, g]);

  if (!pc || !s) {
    return (
      <ChartCard
        eyebrow="Identified from a pulse test"
        title="Open-circuit voltage vs state of charge"
        sub="The curve every equivalent-circuit model is built on."
      >
        <Loading label="loading identified curve…" />
      </ChartCard>
    );
  }

  const { soc_pct: soc, ocv_V: ocv } = pc;
  const path = line(soc, ocv, s);
  const area = `${path}L${s.x(soc[soc.length - 1])},${s.y(s.yTicks[0])}L${s.x(soc[0])},${s.y(s.yTicks[0])}Z`;
  const i = hover;

  return (
    <ChartCard
      eyebrow="Identified from a pulse test"
      title="Open-circuit voltage vs state of charge"
      sub="Rest voltage at 21 charge levels — the curve every equivalent-circuit model is built on."
      footer={
        <>
          <span><b>{soc.length}</b> identified points</span>
          <span><b>{ocv[0].toFixed(3)} – {ocv[ocv.length - 1].toFixed(3)} V</b> range</span>
          <span className="ch-foot__note">{pc.note}</span>
        </>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ch-svg"
        role="img"
        aria-label="Open-circuit voltage as a function of state of charge, 21 identified points"
        onPointerMove={(e) => {
          const x = s.xInv(svgX(e));
          let best = 0;
          for (let k = 1; k < soc.length; k++) {
            if (Math.abs(soc[k] - x) < Math.abs(soc[best] - x)) best = k;
          }
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="ocvFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <Axes
          g={g}
          s={s}
          xLabel="State of charge (%)"
          yLabel="Open-circuit voltage (V)"
          xFmt={(v) => `${v.toFixed(0)}`}
          yFmt={(v) => v.toFixed(1)}
        />

        <path d={area} fill="url(#ocvFill)" />
        <path d={path} className="ch-line ch-line--ocv" pathLength={1} />

        {soc.map((v, k) => (
          <circle key={v} cx={s.x(v)} cy={s.y(ocv[k])} r={i === k ? 5 : 3} className="ch-pt" />
        ))}

        {i !== null && (
          <g className="ch-hover">
            <line x1={s.x(soc[i])} x2={s.x(soc[i])} y1={g.pad.t} y2={H - g.pad.b} className="ch-cross" />
            <Tip
              g={g}
              x={s.x(soc[i])}
              y={s.y(ocv[i])}
              lines={[`${soc[i]}% SoC`, `${ocv[i].toFixed(4)} V`]}
            />
          </g>
        )}
      </svg>
    </ChartCard>
  );
}

// ------------------------------------------- 2. every discharge, one frame

const cycleColor = (i: number, n: number) => {
  const t = n > 1 ? i / (n - 1) : 0;
  return `hsl(${205 - 10 * t} ${68 + 22 * t}% ${70 - 39 * t}%)`;
};

export function CycleOverlayChart() {
  const [cc, setCc] = useState<CycleCurves | null>(null);
  const [hover, setHover] = useState<number | null>(null);   // Ah under pointer
  const [focus, setFocus] = useState<number | null>(null);   // legend hover
  const g = useGeom();

  useEffect(() => {
    let alive = true;
    loadCycleCurves().then((d) => alive && setCc(d)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const s = useMemo(() => {
    if (!cc) return null;
    const xMax = Math.ceil(Math.max(...cc.cycles.map((c) => c.capacityAh)) / 10) * 10;
    return makeScale(g, 0, xMax, 3.0, 4.2, 4, 6);
  }, [cc, g]);

  if (!cc || !s) {
    return (
      <ChartCard
        eyebrow="Measured, 11 consecutive cycles"
        title="Discharge voltage, every cycle overlaid"
        sub="The same cell, discharged again and again."
      >
        <Loading label="loading measured cycles…" />
      </ChartCard>
    );
  }

  const n = cc.cycles.length;
  const caps = cc.cycles.map((c) => c.capacityAh);
  const capMin = Math.min(...caps);
  const capMax = Math.max(...caps);

  // At full scale the 11 curves land on top of each other — that IS the story
  // (the cell repeats itself), but it only reads once the end of discharge is
  // magnified. The inset lives in the empty bottom-left corner of the plot and
  // draws the dense `tail` samples, not the coarse full-curve ones.
  const IN = {
    x: g.pad.l + (g.compact ? 12 : 20),
    y: g.pad.t + g.plotH * 0.46,
    w: g.plotW * (g.compact ? 0.52 : 0.46),
    h: g.plotH * 0.44,
  };
  const inX0 = capMin - cc.tailWindowAh * 0.42;
  const inX1 = capMax + 0.04;
  const tailV = cc.cycles.flatMap((c) =>
    c.tailV.filter((_, k) => c.tailAh[k] >= inX0)
  );
  const inY0 = Math.min(...tailV);
  const inY1 = Math.max(...tailV);
  const xMax = s.xTicks[s.xTicks.length - 1];
  const zoom = Math.round((IN.w * xMax) / ((inX1 - inX0) * g.plotW));
  const ix = (v: number) => IN.x + ((v - inX0) / (inX1 - inX0)) * IN.w;
  const iy = (v: number) => IN.y + IN.h - ((v - inY0) / (inY1 - inY0)) * (IN.h - 26) - 8;
  const inLine = (c: DischargeCycle) => {
    const pts: string[] = [];
    for (let k = 0; k < c.tailAh.length; k++) {
      if (c.tailAh[k] < inX0) continue;
      pts.push(`${pts.length ? 'L' : 'M'}${ix(c.tailAh[k]).toFixed(2)},${iy(c.tailV[k]).toFixed(2)}`);
    }
    return pts.join('');
  };

  const at = hover;
  const vAt = at === null ? [] : cc.cycles.map((c) => interp(c.ah, c.v, at));
  const spread = vAt.length ? (Math.max(...vAt) - Math.min(...vAt)) * 1000 : 0;

  return (
    <ChartCard
      eyebrow={`Measured, ${n} consecutive cycles`}
      title="Discharge voltage, every cycle overlaid"
      sub="The same 80 Ah cell discharged at 0.33C, back to back, for 115 hours. One line per cycle."
      footer={
        <>
          <span><b>{n}</b> full discharges</span>
          <span><b>{capMin.toFixed(2)} – {capMax.toFixed(2)} Ah</b> delivered</span>
          <span className="ch-foot__note">{cc.note}</span>
        </>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ch-svg"
        role="img"
        aria-label={`Terminal voltage against discharged capacity for ${n} consecutive discharge cycles`}
        onPointerMove={(e) => {
          const x = svgX(e);
          if (x < g.pad.l || x > W - g.pad.r) { setHover(null); return; }
          setHover(s.xInv(x));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <Axes
          g={g}
          s={s}
          xLabel="Capacity discharged (Ah)"
          yLabel="Terminal voltage (V)"
          xFmt={(v) => v.toFixed(0)}
          yFmt={(v) => v.toFixed(1)}
        />

        {cc.cycles.map((c, k) => (
          <path
            key={c.index}
            d={line(c.ah, c.v, s)}
            className={`ch-line ch-line--cyc ${focus !== null && focus !== k ? 'is-dim' : ''}`}
            stroke={cycleColor(k, n)}
            strokeWidth={focus === k ? 3 : 1.6}
          />
        ))}

        {at !== null && (
          <g className="ch-hover">
            <line x1={s.x(at)} x2={s.x(at)} y1={g.pad.t} y2={H - g.pad.b} className="ch-cross" />
            <Tip
              g={g}
              x={s.x(at)}
              y={s.y(Math.max(...vAt))}
              lines={[
                `${at.toFixed(1)} Ah drawn`,
                `${Math.min(...vAt).toFixed(3)} – ${Math.max(...vAt).toFixed(3)} V`,
                `${spread.toFixed(0)} mV spread over ${n} cycles`,
              ]}
            />
          </g>
        )}

        {/* ------------------------------------------------ end-of-discharge inset */}
        <g className="ch-inset">
          <defs>
            <clipPath id="insetClip">
              <rect x={IN.x} y={IN.y} width={IN.w} height={IN.h} rx="8" />
            </clipPath>
          </defs>

          {/* Where the magnified window sits on the real curve, and two leaders
              to the panel, so the inset reads as a zoom rather than a second plot. */}
          <rect
            x={s.x(inX0)} y={s.y(inY1)}
            width={s.x(inX1) - s.x(inX0)} height={s.y(inY0) - s.y(inY1)}
            rx="2" className="ch-inset__src"
          />
          <line x1={s.x(inX0)} y1={s.y(inY1)} x2={IN.x + IN.w} y2={IN.y} className="ch-inset__leader" />
          <line x1={s.x(inX0)} y1={s.y(inY0)} x2={IN.x + IN.w} y2={IN.y + IN.h} className="ch-inset__leader" />

          <rect x={IN.x} y={IN.y} width={IN.w} height={IN.h} rx="8" className="ch-inset__bg" />
          <g clipPath="url(#insetClip)">
            {cc.cycles.map((c, k) => (
              <path
                key={c.index}
                d={inLine(c)}
                className={`ch-line ch-line--cyc ${focus !== null && focus !== k ? 'is-dim' : ''}`}
                stroke={cycleColor(k, n)}
                strokeWidth={focus === k ? 2.4 : 1.4}
              />
            ))}
          </g>
          <rect x={IN.x} y={IN.y} width={IN.w} height={IN.h} rx="8" className="ch-inset__frame" />
          {/* Bottom-left is the one corner a discharge curve never reaches — but
              only the left half of it, so the phone copy has to stay short. */}
          <text
            x={IN.x + 12}
            y={IN.y + IN.h - (g.compact ? 30 : 24)}
            className="ch-inset__label"
          >
            {g.compact
              ? `×${zoom} zoom`
              : `Last ${(inX1 - inX0).toFixed(1)} Ah, ×${zoom} magnified`}
          </text>
          <text x={IN.x + 12} y={IN.y + IN.h - 10} className="ch-inset__hint">
            {g.compact
              ? `last ${(inX1 - inX0).toFixed(1)} Ah`
              : `${inX0.toFixed(1)}–${inX1.toFixed(1)} Ah · ${inY0.toFixed(2)}–${inY1.toFixed(2)} V`}
          </text>
        </g>
      </svg>

      <div className="ch-legend" onPointerLeave={() => setFocus(null)}>
        <span className="ch-legend__lbl">Cycle</span>
        {cc.cycles.map((c, k) => (
          <button
            key={c.index}
            type="button"
            className={`ch-swatch ${focus === k ? 'is-on' : ''}`}
            style={{ background: cycleColor(k, n) }}
            onPointerEnter={() => setFocus(k)}
            onFocus={() => setFocus(k)}
            onBlur={() => setFocus(null)}
            title={`Cycle ${c.index} — ${c.capacityAh.toFixed(3)} Ah`}
            aria-label={`Cycle ${c.index}, ${c.capacityAh.toFixed(3)} amp hours`}
          />
        ))}
        <span className="ch-legend__val">
          {focus === null
            ? `${capMin.toFixed(2)}–${capMax.toFixed(2)} Ah`
            : `#${cc.cycles[focus].index} · ${caps[focus].toFixed(3)} Ah`}
        </span>
      </div>
    </ChartCard>
  );
}

// ------------------------------------------- 3. what temperature does to it

/**
 * Cold -> hot, as a diverging scale through a neutral middle rather than a
 * rainbow sweep: the reference temperature is the baseline, so it reads as
 * neutral, and the two extremes carry the meaning.
 */
const TEMP_STOPS: [number, number, number][] = [
  [15, 111, 214],   // cold  — blue
  [91, 100, 112],   // ref   — neutral slate
  [226, 85, 31],    // hot   — orange
];

const tempColor = (i: number, n: number) => {
  if (n <= 1) return `rgb(${TEMP_STOPS[1].join(',')})`;
  const t = (i / (n - 1)) * (TEMP_STOPS.length - 1);
  const k = Math.min(Math.floor(t), TEMP_STOPS.length - 2);
  const f = t - k;
  const c = TEMP_STOPS[k].map((v, j) => Math.round(v + (TEMP_STOPS[k + 1][j] - v) * f));
  return `rgb(${c.join(',')})`;
};

/** Ratios read as headline numbers, so 2.999 must render as "3.0", not "2.999". */
const ratio = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));

export function TemperatureChart() {
  const [sw, setSw] = useState<TemperatureSweep | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const g = useGeom();

  useEffect(() => {
    let alive = true;
    loadTemperatureSweep().then((d) => alive && setSw(d)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const s = useMemo(() => {
    if (!sw) return null;
    const hi = Math.ceil(Math.max(...sw.temps.flatMap((t) => t.R0_mohm)) * 2) / 2;
    return makeScale(g, 0, 100, 0, hi, g.compact ? 4 : 5, Math.round(hi * 2));
  }, [sw, g]);

  if (!sw || !s) {
    return (
      <ChartCard
        eyebrow="Measured, three temperatures"
        title="What temperature does to a cell"
        sub="The same cell, characterised hot, warm and cold."
      >
        <Loading label="loading temperature sweep…" />
      </ChartCard>
    );
  }

  const n = sw.temps.length;
  const cold = sw.temps[0];
  const hot = sw.temps[n - 1];

  return (
    <ChartCard
      eyebrow="Measured, three temperatures"
      title="What temperature does to a cell"
      sub={`One ${sw.cellLabel} cell, run through a full pulse characterisation in a temperature chamber three times. Resistance is the whole story.`}
      footer={
        <>
          <span>Resistance at <b>{cold.label}</b>: <b>{ratio(cold.R0_rel)}×</b> of room temperature</span>
          <span>Capacity there: <b>{(cold.Q_rel * 100 - 100).toFixed(1).replace("-", "−")}%</b></span>
          <span className="ch-foot__note">{sw.caveat}</span>
        </>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ch-svg"
        role="img"
        aria-label={`Ohmic resistance against state of charge at ${n} temperatures, from ${cold.label} to ${hot.label}`}
      >
        <Axes
          g={g}
          s={s}
          xLabel="SoC (%)"
          yLabel="Ohmic resistance R₀ (mΩ)"
          xFmt={(v) => v.toFixed(0)}
          yFmt={(v) => v.toFixed(1)}
        />

        {sw.temps.map((t, k) => (
          <g key={t.T_meas_C}>
            <path
              d={line(t.soc_pct, t.R0_mohm, s)}
              className={`ch-line ch-line--cyc ${focus !== null && focus !== k ? 'is-dim' : ''}`}
              stroke={tempColor(k, n)}
              strokeWidth={focus === k ? 3.4 : 2.4}
            />
            {t.soc_pct.map((x, j) => (
              <circle
                key={x}
                cx={s.x(x)}
                cy={s.y(t.R0_mohm[j])}
                r={focus === k ? 3.4 : 2.2}
                fill={tempColor(k, n)}
                className={focus !== null && focus !== k ? 'is-dim' : ''}
              />
            ))}
            {/* label the curve at its own right-hand end rather than in a legend */}
            <text
              x={s.x(Math.max(...t.soc_pct)) + 6}
              y={s.y(t.R0_mohm[t.R0_mohm.length - 1]) - 6}
              className="ch-tlabel"
              fill={tempColor(k, n)}
            >
              {t.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="ch-tstrip" onPointerLeave={() => setFocus(null)}>
        {sw.temps.map((t, k) => (
          <button
            key={t.T_meas_C}
            type="button"
            className={`ch-tcell ${focus === k ? 'is-on' : ''}`}
            style={{ '--t-accent': tempColor(k, n) } as CSSProperties}
            onPointerEnter={() => setFocus(k)}
            onFocus={() => setFocus(k)}
            onBlur={() => setFocus(null)}
          >
            <span className="ch-tcell__t">{t.label}</span>
            <span className="ch-tcell__row"><i>R₀</i><b>{ratio(t.R0_rel)}×</b></span>
            <span className="ch-tcell__row"><i>capacity</i><b>{t.Q_Ah} Ah</b></span>
            {t.sparse && <span className="ch-tcell__warn">SoC ≥ {t.socFloor_pct}% only</span>}
          </button>
        ))}
      </div>
    </ChartCard>
  );
}

// ------------------------------------------------------------------- tooltip

function Tip({ g, x, y, lines }: { g: Geom; x: number; y: number; lines: string[] }) {
  // Text metrics have to be estimated — measuring would need a layout pass and
  // the tooltip follows the pointer. These constants track the CSS font sizes.
  const em = g.compact ? 11.6 : 6.4;
  const lh = g.compact ? 26 : 16;
  const w = Math.max(...lines.map((l) => l.length)) * em + 20;
  const h = lines.length * lh + 12;
  const flip = x + w + 14 > W - g.pad.r;
  const tx = Math.max(g.pad.l, flip ? x - w - 12 : x + 12);
  const ty = Math.min(Math.max(y - h / 2, g.pad.t + 2), H - g.pad.b - h - 2);
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r="4" className="ch-tip__anchor" />
      <rect x={tx} y={ty} width={w} height={h} rx="7" className="ch-tip__bg" />
      {lines.map((l, i) => (
        <text key={l} x={tx + 10} y={ty + lh + 4 + i * lh} className={`ch-tip__t ${i ? '' : 'is-head'}`}>
          {l}
        </text>
      ))}
    </g>
  );
}

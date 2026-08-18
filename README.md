# Nernst — Battery State-Estimation Platform

A web front end for battery state estimation: load a cycling dataset, pick an
estimator, run it, and read the result with its metrics and provenance.

**Live charts on the landing page are real measurements, not illustrations.**
Every number shown comes from an actual test on an actual cell, exported from
the modelling environment as JSON. Where something has not been measured, it is
not drawn.

## What is here

```
frontend/
  src/types/contract.ts      the data + API contract (single source of truth)
  src/api/client.ts          typed client; each function maps 1:1 to a future endpoint
  src/api/real/loader.ts     loads pre-computed real results
  src/api/mock/data.ts       synthetic datasets for the parts not yet real
  src/components/landing/    marketing page + the SVG figures
  src/components/stages/     the five-step platform flow
  public/results/*.json      exported measurement data
```

## What is deliberately **not** here

The estimator itself. The Simulink dual-EKF model, the parameter-identification
pipeline and the identified cell parameters live outside this repository.

That is the product boundary, and it is intentional. Estimation models are
largely commodity — an equivalent circuit with a Kalman filter is textbook, and
a physics solver can be installed with one command. The work that is hard to
copy is *commissioning*: taking a characterization test on a new cell and
turning it into a validated parameter set. That pipeline stays private.

What this repository publishes is the **result** of runs the model has already
performed, which is enough to show the work without shipping it.

## Data contract

Everything is normalized into one shape before any model sees it — column
oriented parallel arrays with `t`, `current_A`, `voltage_V`, `temperature_C`,
plus metadata (chemistry, nominal capacity, protocol, source). Sign convention:
current > 0 is charge.

The client is mock-first on purpose. Function signatures are the contract, so
swapping the mock for a real backend changes only the body of each function.

## Figures

| Figure | Source |
|---|---|
| Open-circuit voltage vs state of charge | pulse-discharge characterization |
| Discharge voltage, every cycle overlaid | 11 consecutive constant-current discharges |
| What temperature does to a cell | three HPPC runs on one cell in a chamber |

Temperature curves are labelled by the temperature **measured at the cell**,
not the chamber setpoint — the two are not always the same, and the difference
matters more than the label.

## Running it

```bash
cd frontend
npm install
npm run dev
```

Build and type-check:

```bash
npm run build
```

## Status

Demo build. The ECM + EKF estimator is real and validated; the machine-learning
and electrochemical models are shown as roadmap items and are labelled as such
in the UI.

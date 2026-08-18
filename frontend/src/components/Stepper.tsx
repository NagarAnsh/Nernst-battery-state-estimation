export interface Step {
  key: string;
  label: string;
}

interface StepperProps {
  steps: Step[];
  current: number;
  /** Highest step the user has unlocked (for click-back navigation). */
  maxReached: number;
  onSelect: (index: number) => void;
}

export function Stepper({ steps, current, maxReached, onSelect }: StepperProps) {
  return (
    <nav className="stepper">
      {steps.map((step, i) => {
        const state = i === current ? 'active' : i < current ? 'done' : 'todo';
        const clickable = i <= maxReached;
        return (
          <button
            key={step.key}
            className={`step step--${state}`}
            disabled={!clickable}
            onClick={() => clickable && onSelect(i)}
          >
            <span className="step__index">{i < current ? '✓' : i + 1}</span>
            <span className="step__label">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

interface Step {
  key: string;
  label: string;
}

interface Props {
  steps: Step[];
  currentStep: number;
}

export default function StepIndicator({ steps, currentStep }: Props) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center">
          {/* Step circle + label */}
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all
                ${i < currentStep
                  ? 'bg-forest text-cream'
                  : i === currentStep
                    ? 'bg-charcoal text-cream ring-2 ring-charcoal/20 ring-offset-2'
                    : 'bg-sand/50 text-warm-gray'
                }`}
            >
              {i < currentStep ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`mt-2 text-xs tracking-wide
                ${i <= currentStep ? 'text-charcoal font-medium' : 'text-warm-gray'}`}
            >
              {step.label}
            </span>
          </div>
          {/* Connector line */}
          {i < steps.length - 1 && (
            <div
              className={`w-24 h-0.5 mx-3 mb-6 transition-all
                ${i < currentStep ? 'bg-forest' : 'bg-sand/50'}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

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
    <div className="flex items-center justify-center">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center">
          {/* Step circle + label */}
          <div className="flex flex-col items-center min-w-[80px]">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                ${i < currentStep
                  ? 'bg-forest text-cream shadow-md shadow-forest/20'
                  : i === currentStep
                    ? 'bg-charcoal text-cream ring-4 ring-charcoal/15 ring-offset-2 shadow-lg shadow-charcoal/20'
                    : 'bg-sand/50 text-warm-gray'
                }`}
            >
              {i < currentStep ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`mt-2.5 text-sm tracking-wide
                ${i <= currentStep ? 'text-charcoal font-semibold' : 'text-warm-gray'}`}
            >
              {step.label}
            </span>
          </div>
          {/* Connector line */}
          {i < steps.length - 1 && (
            <div className="flex items-center mx-4 mb-7">
              <div
                className={`w-48 h-[3px] rounded-full transition-all
                  ${i < currentStep ? 'bg-forest' : 'bg-sand/40'}`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

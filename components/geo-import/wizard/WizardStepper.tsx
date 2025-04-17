import React from 'react';

interface WizardStepperProps {
  steps: string[];
  currentStep: number;
  onStepChange: (step: number) => void;
}

export function WizardStepper({ steps, currentStep, onStepChange }: WizardStepperProps) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, idx) => (
        <React.Fragment key={label}>
          <button
            className={`px-3 py-1 rounded ${idx === currentStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'} ${idx < currentStep ? 'cursor-pointer' : 'cursor-default'}`}
            disabled={idx > currentStep}
            onClick={() => idx < currentStep && onStepChange(idx)}
          >
            {label}
          </button>
          {idx < steps.length - 1 && <span className="text-gray-400">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
} 
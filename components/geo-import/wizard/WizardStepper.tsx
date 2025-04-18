import React from 'react';

interface WizardStepperProps {
  steps: string[];
  currentStep: number;
  onStepChange: (step: number) => void;
}

export function WizardStepper({ steps, currentStep, onStepChange }: WizardStepperProps) {
  return (
    <div className="flex items-center gap-1 pb-2">
      {steps.map((label, idx) => (
        <React.Fragment key={label}>
          <button
            className={`flex flex-col items-center justify-center w-[100px] min-w-[100px] h-14 px-1 py-1 rounded-lg transition-colors text-center whitespace-normal leading-tight font-medium text-sm
              ${idx === currentStep ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700'}
              ${idx < currentStep ? 'cursor-pointer hover:bg-blue-100' : 'cursor-default'}`}
            disabled={idx > currentStep}
            onClick={() => idx < currentStep && onStepChange(idx)}
            style={{ wordBreak: 'break-word' }}
          >
            <span className="block w-full break-words">{label}</span>
          </button>
          {idx < steps.length - 1 && <span className="text-gray-400 text-lg font-light">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
} 
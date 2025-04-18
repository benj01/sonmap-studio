import React, { useState } from 'react';
import { WizardProvider } from './WizardContext';
import { WizardStepper } from './WizardStepper';
import { FileSelectStep } from './steps/FileSelectStep';
import { ParseStep } from './steps/ParseStep';
import { PreviewStep } from './steps/PreviewStep';
import { AttributeMappingStep } from './steps/AttributeMappingStep';
import { ValidationStep } from './steps/ValidationStep';
import { TransformStep } from './steps/TransformStep';
import { ConfirmStep } from './steps/ConfirmStep';
import { ReviewStep } from './steps/ReviewStep';
// TODO: import future steps

const steps = [
  { label: 'Select File', component: FileSelectStep },
  { label: 'Parse & Analyze', component: ParseStep },
  { label: 'Preview & Select', component: PreviewStep },
  { label: 'Attribute Mapping', component: AttributeMappingStep },
  { label: 'Validation', component: ValidationStep },
  { label: 'Transform', component: TransformStep },
  { label: 'Confirm', component: ConfirmStep },
  { label: 'Review', component: ReviewStep },
  // TODO: AttributeMappingStep, ValidationStep, TransformStep, ConfirmStep, ReviewStep
];

interface ImportWizardProps {
  projectId: string;
  onClose?: () => void;
  initialFileInfo?: any;
  initialStep?: number;
}

export function ImportWizard({ projectId, onClose, initialFileInfo, initialStep = 0 }: ImportWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const StepComponent = steps[currentStep].component;

  return (
    <WizardProvider projectId={projectId} initialFileInfo={initialFileInfo}>
      <div className="text-base text-muted-foreground">
        <WizardStepper
          steps={steps.map(s => s.label)}
          currentStep={currentStep}
          onStepChange={setCurrentStep}
        />
        <div className="mt-6">
          <StepComponent
            onNext={() => setCurrentStep(s => Math.min(s + 1, steps.length - 1))}
            onBack={() => setCurrentStep(s => Math.max(s - 1, 0))}
          />
        </div>
      </div>
    </WizardProvider>
  );
} 
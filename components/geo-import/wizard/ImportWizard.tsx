import React, { useState, useEffect } from 'react';
import { WizardProvider, WizardFileInfo } from './WizardContext';
import { WizardStepper } from './WizardStepper';
import { FileSelectStep } from './steps/FileSelectStep';
import { ParseStep } from './steps/ParseStep';
import { PreviewStep } from './steps/PreviewStep';
import { ValidationStep } from './steps/ValidationStep';
import { ConfirmStep } from './steps/ConfirmStep';
import { ReviewStep } from './steps/ReviewStep';
import { useDevLogger } from '@/utils/logging/devLogger';
import { isDebugEnabled } from '@/utils/logging/debugFlags';

const steps = [
  { label: 'Select File', component: FileSelectStep },
  { label: 'Parse & Analyze', component: ParseStep },
  { label: 'Preview & Select', component: PreviewStep },
  { label: 'Validation', component: ValidationStep },
  { label: 'Confirm', component: ConfirmStep },
  { label: 'Review', component: ReviewStep },
];

interface ImportWizardProps {
  projectId: string;
  onClose?: () => void;
  initialFileInfo?: WizardFileInfo;
  initialStep?: number;
  onRefreshFiles?: () => void;
}

export function ImportWizard({ projectId, onClose, initialFileInfo, initialStep = 0, onRefreshFiles }: ImportWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const StepComponent = steps[currentStep].component;
  const logger = useDevLogger('ImportWizard');

  useEffect(() => {
    if (isDebugEnabled('ImportWizard') && logger.shouldLog()) {
      logger.logInfo('Import wizard initialized', { projectId });
    }
  }, [logger, projectId]);

  return (
    <WizardProvider projectId={projectId} initialFileInfo={initialFileInfo}>
      <div className="w-full max-w-4xl">
        {/* Stepper */}
        <div className="mb-8">
          <WizardStepper
            steps={steps.map(s => s.label)}
            currentStep={currentStep}
            onStepChange={setCurrentStep}
          />
        </div>
        {/* Step Content */}
        <div className="flex-1 min-h-[320px]">
          <StepComponent
            onNext={() => setCurrentStep(s => Math.min(s + 1, steps.length - 1))}
            onBack={() => setCurrentStep(s => Math.max(s - 1, 0))}
            onClose={onClose}
            onRefreshFiles={onRefreshFiles}
          />
        </div>
      </div>
    </WizardProvider>
  );
} 
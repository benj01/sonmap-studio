import React from 'react';
import { useWizard } from '../WizardContext';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'ConfirmStep';
const logManager = LogManager.getInstance();

interface ConfirmStepProps {
  onNext: () => void;
  onBack: () => void;
  onClose?: () => void;
  onRefreshFiles?: () => void;
}

export function ConfirmStep({ onNext, onBack, onClose, onRefreshFiles }: ConfirmStepProps) {
  const {
    fileInfo,
    dataset,
    importDataset,
    heightAttribute,
    targetSrid,
    useSwissTopo,
    selectedFeatureIds,
  } = useWizard();
  
  const datasetForImport = importDataset || dataset;
  const fileName = fileInfo?.name || '(none)';
  const featureCount = selectedFeatureIds.length;
  const heightAttr = heightAttribute === 'z' ? 'Z Coordinate' : heightAttribute;
  const sourceSrid = datasetForImport?.metadata?.srid || 2056;
  
  logManager.debug(SOURCE, 'Confirm step data', {
    hasPreviewDataset: !!dataset,
    previewSrid: dataset?.metadata?.srid,
    hasImportDataset: !!importDataset,
    importSrid: importDataset?.metadata?.srid,
    displayingSrid: sourceSrid,
    usingDataset: importDataset ? 'importDataset' : 'dataset'
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 7: Confirmation & Import</h2>
      <div className="border rounded p-4 bg-gray-50">
        <div><b>File:</b> {fileName}</div>
        <div><b>Features:</b> {featureCount}</div>
        <div><b>Height Attribute:</b> {heightAttr || '(none selected)'}</div>
        <div><b>Source SRID:</b> {sourceSrid}</div>
        <div><b>Target SRID:</b> {targetSrid}</div>
        <div><b>SwissTopo API:</b> {useSwissTopo ? 'Yes' : 'No'}</div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 bg-green-600 text-white rounded"
          onClick={onNext}
          disabled={!fileInfo?.name || !featureCount || !heightAttr || !targetSrid}
        >
          Confirm & Import
        </button>
      </div>
    </div>
  );
} 
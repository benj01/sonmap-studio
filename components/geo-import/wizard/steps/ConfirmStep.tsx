import React from 'react';
import { useWizard } from '../WizardContext';
import { dbLogger } from '@/utils/logging/dbLogger';

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
    heightSource,
    targetSrid,
    selectedFeatureIds,
  } = useWizard();
  
  const datasetForImport = importDataset || dataset;
  const fileName = fileInfo?.name || '(none)';
  const featureCount = selectedFeatureIds.length;
  const sourceSrid = datasetForImport?.metadata?.srid || 2056;
  
  (async () => {
    await dbLogger.debug('Confirm step data', {
      source: 'ConfirmStep',
      hasPreviewDataset: !!dataset,
      previewSrid: dataset?.metadata?.srid,
      hasImportDataset: !!importDataset,
      importSrid: importDataset?.metadata?.srid,
      displayingSrid: sourceSrid,
      usingDataset: importDataset ? 'importDataset' : 'dataset',
      heightSource
    });
  })();

  // Function to render height source information
  const renderHeightSourceInfo = () => {
    if (heightSource.type === 'z' && heightSource.status === 'detected') {
      return (
        <div><b>Height Source:</b> Z-coordinates (automatically detected)</div>
      );
    } else {
      return (
        <div><b>Height Source:</b> None detected (elevation data can be applied later)</div>
      );
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 5: Confirmation & Import</h2>
      <div className="border rounded p-4 bg-gray-50">
        <div><b>File:</b> {fileName}</div>
        <div><b>Features:</b> {featureCount}</div>
        {renderHeightSourceInfo()}
        <div><b>Source SRID:</b> {sourceSrid}</div>
        <div><b>Target SRID:</b> {targetSrid}</div>
        {sourceSrid === 2056 && (
          <div className="text-xs text-gray-600 mt-2">
            <i>Note: LV95 coordinates will be preserved for accurate height transformations.</i>
          </div>
        )}
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
          disabled={!fileInfo?.name || !featureCount || !targetSrid}
        >
          Confirm & Import
        </button>
      </div>
    </div>
  );
} 
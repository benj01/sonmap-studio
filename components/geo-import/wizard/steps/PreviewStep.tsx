import React from 'react';
import { useWizard } from '../WizardContext';
import { MapPreview } from '../../components/map-preview';

interface PreviewStepProps {
  onNext: () => void;
  onBack: () => void;
  onClose?: () => void;
  onRefreshFiles?: () => void;
}

export function PreviewStep({ onNext, onBack, onClose, onRefreshFiles }: PreviewStepProps) {
  const { dataset, selectedFeatureIds, setSelectedFeatureIds } = useWizard();
  const features = dataset?.features || [];
  const meta = dataset?.metadata || {};

  const handleToggle = (id: number) => {
    setSelectedFeatureIds(
      selectedFeatureIds.includes(id)
        ? selectedFeatureIds.filter(fid => fid !== id)
        : [...selectedFeatureIds, id]
    );
  };

  const handleSelectAll = () => setSelectedFeatureIds(features.map((f: any) => f.id));
  const handleDeselectAll = () => setSelectedFeatureIds([]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 3: Preview & Feature Selection</h2>
      <div className="text-sm text-gray-700">
        Features: {meta.featureCount || features.length} | Types: {(meta.geometryTypes || []).join(', ')}
      </div>
      <MapPreview
        features={features}
        bounds={meta.bounds}
        selectedFeatureIds={selectedFeatureIds}
        onFeaturesSelected={(featureIdsOrUpdater) =>
          setSelectedFeatureIds((prev: number[]) =>
            typeof featureIdsOrUpdater === 'function'
              ? featureIdsOrUpdater(prev)
              : featureIdsOrUpdater
          )
        }
      />
      <div className="max-h-48 overflow-y-auto border rounded p-2 bg-gray-50">
        {features.map((f: any) => (
          <div key={f.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedFeatureIds.includes(f.id)}
              onChange={() => handleToggle(f.id)}
            />
            <span className="text-xs">Feature #{f.id} ({f.geometry?.type || 'Unknown'})</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        <button
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          disabled={selectedFeatureIds.length === 0}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
} 
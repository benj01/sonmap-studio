import React, { useState, useEffect, useMemo } from 'react';
import { useWizard } from '../WizardContext';
// import booleanValid from '@turf/boolean-valid'; // Uncomment if turf is available

function arraysEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface ValidationStepProps {
  onNext: () => void;
  onBack: () => void;
  onClose?: () => void;
  onRefreshFiles?: () => void;
}

export function ValidationStep({ onNext, onBack, onClose, onRefreshFiles }: ValidationStepProps) {
  const { dataset, selectedFeatureIds } = useWizard();
  // Memoize features to avoid unnecessary re-renders
  const features = useMemo(
    () => (dataset?.features || []).filter((f: any) => selectedFeatureIds.includes(f.id)),
    [dataset?.features, selectedFeatureIds]
  );

  // Simulate real validation: mark features with missing geometry or empty coordinates as invalid
  const [invalidIds, setInvalidIds] = useState<number[]>([]);
  const [repaired, setRepaired] = useState(false);

  useEffect(() => {
    // Real validation logic (replace with turf or PostGIS if available)
    const invalid = features.filter((f: any) => {
      if (!f.geometry || !f.geometry.type || !f.geometry.coordinates) return true;
      if (Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length === 0) return true;
      // Optionally: use turf.booleanValid(f.geometry)
      return false;
    }).map((f: any) => f.id);
    setInvalidIds(prev => (arraysEqual(prev, invalid) ? prev : invalid));
    setRepaired(false);
  }, [features]);

  const handleRepair = () => {
    // Simulate repair: mark all as repaired
    setRepaired(true);
    setInvalidIds([]);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 5: Validation & Repair</h2>
      <div className="text-sm text-gray-700 mb-2">
        {invalidIds.length === 0
          ? 'No geometry or attribute issues detected.'
          : `${invalidIds.length} features have geometry/attribute issues.`}
      </div>
      {invalidIds.length > 0 && !repaired && (
        <button
          className="px-3 py-1 bg-yellow-500 text-white rounded"
          onClick={handleRepair}
        >
          Auto-Repair All
        </button>
      )}
      {invalidIds.length > 0 && (
        <div className="text-xs text-gray-500 mb-1">Preview (first 3 issues):</div>
      )}
      {invalidIds.length > 0 && (
        <div className="border rounded p-2 bg-gray-50">
          {invalidIds.slice(0, 3).map((id) => (
            <div key={id} className="flex gap-2 items-center">
              <span className="w-16">#{id}</span>
              <span className="text-red-600">Invalid geometry</span>
              {repaired && <span className="text-green-600">(Repaired)</span>}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-4">
        <button
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={onNext}
          disabled={invalidIds.length > 0 && !repaired}
        >
          Next
        </button>
      </div>
    </div>
  );
} 
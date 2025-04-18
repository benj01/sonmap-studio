import React, { useState, useEffect } from 'react';
import { useWizard } from '../WizardContext';

interface TransformStepProps {
  onNext: () => void;
  onBack: () => void;
  onClose?: () => void;
  onRefreshFiles?: () => void;
}

export function TransformStep({ onNext, onBack, onClose, onRefreshFiles }: TransformStepProps) {
  const { dataset, setTargetSrid, useSwissTopo, setUseSwissTopo } = useWizard();
  const sourceSrid = dataset?.metadata?.srid || 2056;

  useEffect(() => {
    setTargetSrid(4326);
    setUseSwissTopo(!!useSwissTopo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSwissTopo]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 6: Transformation & Height Conversion</h2>
      <div className="text-sm text-gray-700 mb-2">
        <div>Detected source SRID: <span className="font-mono">{sourceSrid}</span></div>
        <div className="mt-2">
          Target SRID:
          <span className="ml-2 border rounded px-2 py-1 w-24 bg-gray-100 text-gray-500 cursor-not-allowed">4326</span>
        </div>
      </div>
      {sourceSrid === 2056 && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="swisstopo"
            checked={useSwissTopo}
            onChange={e => setUseSwissTopo(e.target.checked)}
          />
          <label htmlFor="swisstopo" className="text-sm">Use SwissTopo API for height conversion</label>
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
        >
          Next
        </button>
      </div>
    </div>
  );
} 
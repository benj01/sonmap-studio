import React, { useState, useEffect } from 'react';
import { useWizard } from '../WizardContext';

interface TransformStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function TransformStep({ onNext, onBack }: TransformStepProps) {
  const { dataset, targetSrid, setTargetSrid, useSwissTopo, setUseSwissTopo } = useWizard();
  const sourceSrid = dataset?.metadata?.srid || 2056;
  const [localTargetSrid, setLocalTargetSrid] = useState(targetSrid || 4326);
  const [localSwissTopo, setLocalSwissTopo] = useState(!!useSwissTopo);

  useEffect(() => {
    setTargetSrid(localTargetSrid);
    setUseSwissTopo(localSwissTopo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTargetSrid, localSwissTopo]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 6: Transformation & Height Conversion</h2>
      <div className="text-sm text-gray-700 mb-2">
        <div>Detected source SRID: <span className="font-mono">{sourceSrid}</span></div>
        <div className="mt-2">
          Target SRID:
          <input
            type="number"
            className="ml-2 border rounded px-2 py-1 w-24"
            value={localTargetSrid}
            onChange={e => setLocalTargetSrid(Number(e.target.value))}
          />
        </div>
      </div>
      {sourceSrid === 2056 && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="swisstopo"
            checked={localSwissTopo}
            onChange={e => setLocalSwissTopo(e.target.checked)}
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
          disabled={!localTargetSrid}
        >
          Next
        </button>
      </div>
    </div>
  );
} 
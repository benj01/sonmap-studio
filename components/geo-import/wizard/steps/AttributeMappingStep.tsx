import React, { useState, useEffect } from 'react';
import { useWizard } from '../WizardContext';

interface AttributeMappingStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function AttributeMappingStep({ onNext, onBack }: AttributeMappingStepProps) {
  const { dataset, heightAttribute, setHeightAttribute } = useWizard();
  const properties: string[] = dataset?.metadata?.properties || [];
  const features = dataset?.features || [];
  const [selected, setSelected] = useState<string | 'z' | ''>(heightAttribute || '');

  useEffect(() => {
    setHeightAttribute(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Preview: show first 5 features with the selected attribute or Z
  const preview = features.slice(0, 5).map((f: any) => ({
    id: f.id,
    value: selected === 'z' ? f.geometry?.coordinates?.[2] : f.properties?.[selected]
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 4: Attribute & Height Mapping</h2>
      <div className="text-sm text-gray-700 mb-2">Select which attribute (or Z) to use for height:</div>
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          className={`px-2 py-1 rounded border ${selected === 'z' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
          onClick={() => setSelected('z')}
        >
          Z Coordinate
        </button>
        {properties.map((prop) => (
          <button
            key={prop}
            className={`px-2 py-1 rounded border ${selected === prop ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
            onClick={() => setSelected(prop)}
          >
            {prop}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-500 mb-1">Preview (first 5 features):</div>
      <div className="border rounded p-2 bg-gray-50">
        {preview.map((row) => (
          <div key={row.id} className="flex gap-2 items-center">
            <span className="w-16">#{row.id}</span>
            <span>{row.value !== undefined ? row.value : <span className="text-gray-400">(none)</span>}</span>
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
          disabled={!selected}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
} 
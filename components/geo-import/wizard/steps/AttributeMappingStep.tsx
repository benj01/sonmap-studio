import React, { useState } from 'react';
import { useWizard } from '../WizardContext';
import { GeoFeature } from '@/types/geo';

interface AttributeMappingStepProps {
  onNext: () => void;
  onBack: () => void;
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((p) => typeof p === 'string');
}

function isPointGeometry(geometry: GeoFeature['geometry']): geometry is import('geojson').Point {
  return geometry !== null && typeof geometry === 'object' && geometry.type === 'Point' && Array.isArray(geometry.coordinates);
}

export function AttributeMappingStep({ onNext, onBack }: AttributeMappingStepProps) {
  const { dataset } = useWizard();
  const properties: string[] = isStringArray(dataset?.metadata?.properties)
    ? dataset?.metadata?.properties
    : [];
  const features = dataset?.features || [];
  const [selected, setSelected] = useState<string | 'z' | ''>('');

  function getZCoordinate(geometry: GeoFeature['geometry']): number | undefined {
    if (isPointGeometry(geometry)) {
      return geometry.coordinates[2];
    }
    return undefined;
  }

  // Preview: show first 5 features with the selected attribute or Z
  const preview = features.slice(0, 5).map((f: GeoFeature) => ({
    id: f.id,
    value: selected === 'z' ? getZCoordinate(f.geometry) : f.properties?.[selected]
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 4: Attribute & Height Mapping</h2>
      <div className="text-sm text-gray-700 mb-2">Select which attribute (or Z) to use for height:</div>
      <div className="mb-2">
        <select
          className="w-full max-w-md px-3 py-2 border rounded text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selected}
          onChange={e => setSelected(e.target.value)}
        >
          <option value="z">Z Coordinate</option>
          {properties.map((prop) => (
            <option key={prop} value={prop}>{prop}</option>
          ))}
        </select>
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
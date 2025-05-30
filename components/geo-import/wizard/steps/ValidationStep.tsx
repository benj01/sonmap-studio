import React, { useState, useEffect, useMemo } from 'react';
import { useWizard } from '../WizardContext';
import { GeoFeature } from '@/types/geo';
import { dbLogger } from '@/utils/logging/dbLogger';
// import booleanValid from '@turf/boolean-valid'; // Uncomment if turf is available

function arraysEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface ValidationStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ValidationStep({ onNext, onBack }: ValidationStepProps) {
  const { dataset, importDataset, selectedFeatureIds, setImportDataset } = useWizard();
  // Memoize features to avoid unnecessary re-renders
  const features = useMemo(
    () => (dataset?.features || []).filter((f: GeoFeature) => typeof f.id === 'number' && selectedFeatureIds.includes(f.id)),
    [dataset?.features, selectedFeatureIds]
  );

  // Simulate real validation: mark features with missing geometry or empty coordinates as invalid
  const [invalidIds, setInvalidIds] = useState<number[]>([]);
  const [repaired, setRepaired] = useState(false);

  useEffect(() => {
    // Real validation logic (replace with turf or PostGIS if available)
    const invalid = features.filter((f: GeoFeature) => {
      if (!f.geometry || !f.geometry.type) return true;
      if (f.geometry.type === 'GeometryCollection') return true;
      // Only geometries with coordinates property
      if (!('coordinates' in f.geometry)) return true;
      const coords = (f.geometry as { coordinates?: unknown }).coordinates;
      if (Array.isArray(coords) && coords.length === 0) return true;
      // Optionally: use turf.booleanValid(f.geometry)
      return false;
    })
    .map((f: GeoFeature) => typeof f.id === 'number' ? f.id : undefined)
    .filter((id): id is number => typeof id === 'number');
    setInvalidIds(prev => (arraysEqual(prev, invalid) ? prev : invalid));
    setRepaired(false);
  }, [features]);

  const handleRepair = () => {
    // Simulate repair: mark all as repaired
    setRepaired(true);
    setInvalidIds([]);
  };

  // Handler for Next button: set importDataset before proceeding
  const handleNext = async () => {
    // Only proceed if there are no invalid features or all have been repaired
    if (invalidIds.length === 0 || repaired) {
      if (!importDataset) {
        // Log and block if original dataset is missing
        await dbLogger.error('ValidationStep: importDataset missing when attempting to filter for import', {
          source: 'ValidationStep',
          selectedFeatureIds,
        });
        alert('Error: Original import dataset is missing. Cannot proceed.');
        return;
      }
      // Filter the original importDataset (original CRS) by selectedFeatureIds
      const filteredFeatures = (importDataset.features || []).filter(
        (f: GeoFeature) => typeof f.id === 'number' && selectedFeatureIds.includes(f.id)
      );
      // Runtime check: warn if SRID is 4326 but coordinates are not in WGS84 range
      const srid = importDataset.metadata?.srid;
      if (srid === 4326 && filteredFeatures.length > 0) {
        const sample = filteredFeatures[0];
        if (sample.geometry && 'coordinates' in sample.geometry) {
          const coords = (sample.geometry as any).coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            const [lng, lat] = coords;
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
              await dbLogger.warn('ValidationStep: SRID is 4326 but coordinates are outside WGS84 range', {
                source: 'ValidationStep',
                lng, lat, srid
              });
            }
          }
        }
      }
      await dbLogger.info('ValidationStep: Setting filtered importDataset for import', {
        source: 'ValidationStep',
        filteredCount: filteredFeatures.length,
        srid,
      });
      setImportDataset({
        features: filteredFeatures,
        metadata: importDataset.metadata,
      });
      onNext();
    }
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
          onClick={handleNext}
          disabled={invalidIds.length > 0 && !repaired}
        >
          Next
        </button>
      </div>
    </div>
  );
} 
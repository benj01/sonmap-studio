import React, { useEffect } from 'react';
import { useWizard } from '../WizardContext';
import { MapPreview } from '../../components/map-preview';
import { dbLogger } from '@/utils/logging/dbLogger';
import { abbreviateCoordinatesForLog } from '@/components/map/utils/logging';
import { GeoFeature, DatasetMetadata } from '@/types/geo-import';

interface PreviewStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function PreviewStep({ onNext, onBack }: PreviewStepProps) {
  const { dataset, selectedFeatureIds, setSelectedFeatureIds } = useWizard();
  const features: GeoFeature[] = (dataset?.features as GeoFeature[]) || [];
  const meta: DatasetMetadata | undefined = dataset?.metadata as DatasetMetadata | undefined;

  // Log received dataset coordinates for debugging
  useEffect(() => {
    if (dataset && Array.isArray(dataset.features) && dataset.features.length > 0) {
      const firstFeature = dataset.features[0];
      const firstGeometry = firstFeature?.geometry;
      (async () => {
        await dbLogger.debug('Received dataset for preview', {
          source: 'PreviewStep',
          srid: dataset.metadata?.srid,
          featureCount: Array.isArray(dataset.features) ? dataset.features.length : 0,
          firstFeatureGeometryType: firstGeometry?.type
        });
        // Log sample coordinates based on geometry type
        if (firstGeometry) {
          if (firstGeometry.type === 'Point' && 'coordinates' in firstGeometry) {
            const coords = firstGeometry.coordinates;
            await dbLogger.debug('First point coordinates', {
              source: 'PreviewStep',
              coordinates: abbreviateCoordinatesForLog({ type: 'Point', coordinates: coords })
            });
          } else if ((firstGeometry.type === 'LineString' || firstGeometry.type === 'MultiPoint') && 'coordinates' in firstGeometry) {
            const coords = firstGeometry.coordinates;
            await dbLogger.debug('First line/multipoint coordinates (first 3 points)', {
              source: 'PreviewStep',
              coordinates: abbreviateCoordinatesForLog({ type: firstGeometry.type, coordinates: coords })
            });
          } else if ((firstGeometry.type === 'Polygon' || firstGeometry.type === 'MultiLineString') && 'coordinates' in firstGeometry) {
            const coords = Array.isArray(firstGeometry.coordinates) && Array.isArray(firstGeometry.coordinates[0]) ? firstGeometry.coordinates[0] : [];
            await dbLogger.debug('First polygon/multiline coordinates (first ring, first 3 points)', {
              source: 'PreviewStep',
              coordinates: abbreviateCoordinatesForLog({ type: firstGeometry.type, coordinates: coords })
            });
          } else if (firstGeometry.type === 'MultiPolygon' && 'coordinates' in firstGeometry) {
            const coords = Array.isArray(firstGeometry.coordinates) && Array.isArray(firstGeometry.coordinates[0]) && Array.isArray(firstGeometry.coordinates[0][0]) ? firstGeometry.coordinates[0][0] : [];
            await dbLogger.debug('First multipolygon coordinates (first polygon, first ring, first 3 points)', {
              source: 'PreviewStep',
              coordinates: abbreviateCoordinatesForLog({ type: firstGeometry.type, coordinates: coords })
            });
          }
        }
      })();
    }
  }, [dataset]); // Re-run when dataset changes

  const handleToggle = (id: number) => {
    setSelectedFeatureIds(
      selectedFeatureIds.includes(id)
        ? selectedFeatureIds.filter(fid => fid !== id)
        : [...selectedFeatureIds, id]
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 3: Preview & Feature Selection</h2>
      <div className="text-sm text-gray-700">
        Features: {meta?.featureCount ?? features.length} | Types: {Array.isArray(meta?.geometryTypes) ? meta.geometryTypes.join(', ') : ''}
      </div>
      <MapPreview
        features={features}
        bounds={Array.isArray(meta?.bounds) ? meta.bounds : undefined}
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
        {features.filter(f => typeof f.id === 'number').map((f) => (
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
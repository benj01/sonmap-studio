import React, { useState, useEffect } from 'react';
import { useWizard } from '../WizardContext';
import { createClient } from '@/utils/supabase/client';
import { dbLogger } from '@/utils/logging/dbLogger';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { GeoFeature } from '@/types/geo';
import { abbreviateCoordinatesForLog } from '@/components/map/utils/logging';

interface ReviewStepProps {
  onNext: () => void;
  onBack: () => void;
  onClose?: () => void;
  onRefreshFiles?: () => void;
}

export function ReviewStep({ onBack, onClose, onRefreshFiles }: ReviewStepProps) {
  const {
    fileInfo,
    importDataset: datasetForImport,
    selectedFeatureIds,
    heightSource,
    targetSrid,
  } = useWizard();
  const [result, setResult] = useState<null | {
    success: boolean;
    imported: number;
    failed: number;
    warnings: string[];
    errors: string[];
  }>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (result && result.success) {
      // Show toast and close wizard after short delay
      toast.success(`Import successful: ${result.imported} features imported.`);
      if (onRefreshFiles) onRefreshFiles();
      setTimeout(() => {
        if (onClose) onClose();
      }, 1500);
    }
  }, [result, onClose, onRefreshFiles]);

  const handleImport = async () => {
    await dbLogger.info('handleImport: ENTERED', { source: 'GeoImportReviewStep' });
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      // Get auth token if needed
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No authentication token available');
      
      // Use importDataset (original, untransformed) for import
      const features = (datasetForImport?.features || []).filter(
        (f: GeoFeature): f is GeoFeature & { id: number } => typeof f.id === 'number' && selectedFeatureIds.includes(f.id as number)
      );
      
      const payload = {
        projectFileId: fileInfo?.id,
        collectionName: fileInfo?.name || 'Imported Features',
        features: features,
        sourceSrid: datasetForImport?.metadata?.srid || 2056,
        targetSrid: targetSrid,
        batchSize: 100
      };
      
      // Log both datasets to confirm the correct one is being used
      await dbLogger.info('Available datasets', {
        source: 'GeoImportReviewStep',
        hasPreviewDataset: !!datasetForImport,
        previewDatasetSrid: datasetForImport?.metadata?.srid,
        usingDataset: 'importDataset',
        selectedSrid: payload.sourceSrid,
        heightSource
      });
      
      // Log the payload
      await dbLogger.info('Import payload', {
        source: 'GeoImportReviewStep',
        projectFileId: payload.projectFileId,
        collectionName: payload.collectionName,
        featureCount: payload.features.length,
        sourceSrid: payload.sourceSrid,
        targetSrid: payload.targetSrid,
        heightSource,
        features: payload.features.length > 0 
          ? [{ 
              id: payload.features[0].id, 
              geometry: abbreviateCoordinatesForLog(payload.features[0].geometry),
              properties: payload.features[0].properties
            }] 
          : []
      });
      
      // Debug log: sample first 3-5 coordinate pairs of the first feature
      if (features.length > 0) {
        const firstFeature = features[0];
        await dbLogger.debug('Import coordinate sample', {
          source: 'GeoImportReviewStep',
          featureId: firstFeature.id,
          geometryType: firstFeature.geometry?.type,
          sourceSrid: payload.sourceSrid,
          abbreviatedGeometry: abbreviateCoordinatesForLog(firstFeature.geometry),
        });
      }
      
      // Check for missing required parameters
      if (!payload.projectFileId || !payload.collectionName || !payload.features.length || !payload.sourceSrid || !payload.targetSrid) {
        const missing = {
          projectFileId: payload.projectFileId,
          collectionName: payload.collectionName,
          features: payload.features.length,
          sourceSrid: payload.sourceSrid,
          targetSrid: payload.targetSrid
        };
        await dbLogger.error('Missing required parameters', { source: 'GeoImportReviewStep', ...missing });
        setError('Missing required parameters: ' + JSON.stringify(missing));
        setImporting(false);
        return;
      }
      // Call backend API
      const response = await fetch('/api/geo-import/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      let responseData;
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }
      await dbLogger.info('Backend response', { source: 'GeoImportReviewStep', status: response.status, response: responseData });
      if (!response.ok) {
        throw new Error(typeof responseData === 'string' ? responseData : JSON.stringify(responseData));
      }
      setResult({
        success: true,
        imported: responseData.imported || features.length,
        failed: responseData.failed || 0,
        warnings: responseData.warnings || [],
        errors: responseData.errors || [],
      });
    } catch (err: unknown) {
      let errorMsg = 'Import failed';
      let errorStack = undefined;
      if (err instanceof Error) {
        errorMsg = err.message;
        errorStack = err.stack;
      } else if (typeof err === 'string') {
        errorMsg = err;
      }
      await dbLogger.error('Import failed', { source: 'GeoImportReviewStep', error: errorMsg, stack: errorStack });
      setResult({
        success: false,
        imported: 0,
        failed: selectedFeatureIds.length,
        warnings: [],
        errors: [errorMsg],
      });
      setError(errorMsg);
    } finally {
      setImporting(false);
    }
  };

  const handleViewOnMap = () => {
    // Navigate to map view (replace with your actual route)
    router.push('/map');
    if (onClose) onClose();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 6: Post-Import Review</h2>
      {!result && (
        <div>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? 'Importing...' : 'Start Import'}
          </button>
          {error && <div className="text-red-600 mt-2">{error}</div>}
        </div>
      )}
      {result && (
        <div className="border rounded p-4 bg-gray-50">
          {result.success ? (
            <>
              <div className="text-green-700 font-semibold mb-2">Import successful!</div>
              <div>Imported features: {result.imported}</div>
              {result.failed > 0 && <div className="text-red-600">Failed: {result.failed}</div>}
              {result.warnings.length > 0 && (
                <div className="text-yellow-600">Warnings: {result.warnings.join(', ')}</div>
              )}
            </>
          ) : (
            <>
              <div className="text-red-700 font-semibold mb-2">Import failed.</div>
              {result.errors.length > 0 && (
                <div className="text-red-600">Errors: {result.errors.join(', ')}</div>
              )}
            </>
          )}
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
          onClick={handleViewOnMap}
          disabled={!result || !result.success}
        >
          View on Map
        </button>
      </div>
    </div>
  );
} 
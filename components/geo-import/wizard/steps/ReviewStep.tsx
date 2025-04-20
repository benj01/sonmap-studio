import React, { useState, useEffect } from 'react';
import { useWizard } from '../WizardContext';
import { createClient } from '@/utils/supabase/client';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface ReviewStepProps {
  onNext: () => void;
  onBack: () => void;
  onClose?: () => void;
  onRefreshFiles?: () => void;
}

const LOG_SOURCE = 'GeoImportReviewStep';
const logManager = LogManager.getInstance();
logManager.setComponentLogLevel(LOG_SOURCE, LogLevel.DEBUG);

export function ReviewStep({ onBack, onClose, onRefreshFiles }: ReviewStepProps) {
  const {
    fileInfo,
    dataset,
    importDataset,
    selectedFeatureIds,
    heightAttribute,
    targetSrid,
    useSwissTopo,
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
        onClose && onClose();
      }, 1500);
    }
  }, [result, onClose, onRefreshFiles]);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      // Get auth token if needed
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No authentication token available');
      
      // IMPORTANT: Use importDataset instead of dataset for the import payload
      // This ensures original (untransformed) coordinates are sent to the backend
      const datasetForImport = importDataset || dataset;
      
      // Prepare features to import (using original coordinates)
      const features = (datasetForImport?.features || []).filter((f: any) => selectedFeatureIds.includes(f.id));
      
      // Prepare payload (include collectionName as required by backend)
      const payload = {
        projectFileId: fileInfo?.id,
        collectionName: fileInfo?.name || 'Imported Features',
        features: features.map((f: any) => ({
          ...f,
          height: heightAttribute === 'z' ? f.geometry?.coordinates?.[2] : f.properties?.[heightAttribute],
        })),
        sourceSrid: datasetForImport?.metadata?.srid || 2056,
        targetSrid,
        useSwissTopo,
        heightAttribute,
      };
      
      // Log both datasets to confirm the correct one is being used
      logManager.info(LOG_SOURCE, 'Available datasets', {
        hasPreviewDataset: !!dataset,
        previewDatasetSrid: dataset?.metadata?.srid,
        hasImportDataset: !!importDataset,
        importDatasetSrid: importDataset?.metadata?.srid,
        usingDataset: importDataset ? 'importDataset' : 'dataset',
        selectedSrid: payload.sourceSrid
      });
      
      // Log the payload
      logManager.info(LOG_SOURCE, 'Import payload', {
        projectFileId: payload.projectFileId,
        collectionName: payload.collectionName,
        featureCount: payload.features.length,
        sourceSrid: payload.sourceSrid,
        targetSrid: payload.targetSrid,
        // Show sample of first feature's coordinates
        features: payload.features.length > 0 
          ? [{ 
              id: payload.features[0].id, 
              geometry: { 
                type: payload.features[0].geometry.type,
                coordinates: JSON.stringify(payload.features[0].geometry.coordinates).substring(0, 100) + '...' 
              }
            }] 
          : []
      });
      
      // Check for missing required parameters
      if (!payload.projectFileId || !payload.collectionName || !payload.features.length || !payload.sourceSrid || !payload.targetSrid) {
        const missing = {
          projectFileId: payload.projectFileId,
          collectionName: payload.collectionName,
          features: payload.features.length,
          sourceSrid: payload.sourceSrid,
          targetSrid: payload.targetSrid
        };
        logManager.error(LOG_SOURCE, 'Missing required parameters', missing);
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
      } catch (e) {
        responseData = await response.text();
      }
      logManager.info(LOG_SOURCE, 'Backend response', { status: response.status, response: responseData });
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
    } catch (err: any) {
      logManager.error(LOG_SOURCE, 'Import failed', { error: err.message, stack: err.stack });
      setResult({
        success: false,
        imported: 0,
        failed: selectedFeatureIds.length,
        warnings: [],
        errors: [err.message || 'Import failed'],
      });
      setError(err.message || 'Import failed');
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
      <h2 className="text-lg font-semibold">Step 8: Post-Import Review</h2>
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
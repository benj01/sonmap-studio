import { useState, useCallback } from 'react';
import { Feature } from 'geojson';
import { ProcessingOptions, ProgressInfo, ErrorInfo } from '../types';
import { FeatureProcessor } from '../services/feature-processor';
import { CoordinateSystemService } from '../services/coordinate-system';

export function useProcessing() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo>({
    progress: 0,
    status: ''
  });
  const [error, setError] = useState<ErrorInfo | null>(null);

  const processFeatures = useCallback(
    async (
      features: Feature[],
      options: ProcessingOptions = {}
    ): Promise<Feature[]> => {
      try {
        setProcessing(true);
        setError(null);
        setProgress({ progress: 0, status: 'Starting processing...' });

        // Initialize services
        const processor = FeatureProcessor.getInstance();
        const coordService = CoordinateSystemService.getInstance();

        // Update progress
        setProgress({ progress: 0.2, status: 'Validating features...' });

        // Process features
        const processed = await processor.process(features, options);

        // Update progress
        setProgress({ progress: 0.6, status: 'Transforming coordinates...' });

        // Transform coordinates if needed
        const transformed = options.coordinateSystem
          ? await coordService.transform(
              processed,
              'EPSG:4326', // Assuming WGS84 as default
              options.coordinateSystem
            )
          : processed;

        // Final progress update
        setProgress({ progress: 1, status: 'Processing complete' });

        return transformed;
      } catch (err) {
        const errorInfo: ErrorInfo = {
          message: 'Failed to process features',
          code: 'PROCESSING_ERROR',
          details: {
            error: err instanceof Error ? err.message : String(err)
          }
        };
        setError(errorInfo);
        throw errorInfo;
      } finally {
        setProcessing(false);
      }
    },
    []
  );

  const cancelProcessing = useCallback(() => {
    // Implement cancellation logic
    setProcessing(false);
    setProgress({ progress: 0, status: '' });
    setError(null);
  }, []);

  return {
    processing,
    progress,
    error,
    processFeatures,
    cancelProcessing
  };
}

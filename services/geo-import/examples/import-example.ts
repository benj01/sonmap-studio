import { createClient } from '@/utils/supabase/server-client';
import { ImportService } from '../import-service';
import { SupabaseImportAdapter } from '../adapters/supabase-import-adapter';
import { SupabaseStorageAdapter } from '../adapters/supabase-storage-adapter';
import { SupabaseMetricsAdapter } from '../adapters/supabase-metrics-adapter';
import { GeoFeature } from '@/types/geo';

export async function importGeoFeatures(
  projectFileId: string,
  collectionName: string,
  features: GeoFeature[],
  sourceSrid: number
) {
  // Create Supabase client using the enhanced server client
  const supabase = await createClient();

  // Create adapters
  const importAdapter = new SupabaseImportAdapter(supabase);
  const storageAdapter = new SupabaseStorageAdapter(supabase);
  const metricsAdapter = new SupabaseMetricsAdapter(supabase);

  // Create import service
  const importService = new ImportService(
    importAdapter,
    storageAdapter,
    metricsAdapter,
    {
      defaultBatchSize: 100,
      defaultTargetSrid: 4326,
      maxRetries: 3,
      retryDelay: 1000,
      checkpointInterval: 5000
    }
  );

  // Import features
  const result = await importService.importFeatures({
    projectFileId,
    collectionName,
    features,
    sourceSrid
  });

  return result;
}

export async function streamGeoFeatures(
  projectFileId: string,
  collectionName: string,
  features: GeoFeature[],
  sourceSrid: number,
  onProgress?: (progress: any) => void
) {
  // Create Supabase client using the enhanced server client
  const supabase = await createClient();

  // Create adapters
  const importAdapter = new SupabaseImportAdapter(supabase);
  const storageAdapter = new SupabaseStorageAdapter(supabase);
  const metricsAdapter = new SupabaseMetricsAdapter(supabase);

  // Create import service
  const importService = new ImportService(
    importAdapter,
    storageAdapter,
    metricsAdapter,
    {
      defaultBatchSize: 100,
      defaultTargetSrid: 4326,
      maxRetries: 3,
      retryDelay: 1000,
      checkpointInterval: 5000
    }
  );

  // Stream features
  const stream = await importService.streamFeatures({
    projectFileId,
    collectionName,
    features,
    sourceSrid,
    onProgress,
    onComplete: (result) => {
      console.log('Import completed:', result);
    },
    onError: (error) => {
      console.error('Import failed:', error);
    }
  });

  return stream;
} 
import { useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { 
  ImportSession, 
  FullDataset, 
  PreviewDataset, 
  PreviewConfig,
  CreateImportSessionParams
} from '@/types/geo-import';
import { createLogger } from '@/utils/logger';

const supabase = createClient();
const logger = createLogger('GeoImport');

/**
 * Hook for managing geodata import sessions
 * Handles file downloading, preview generation, and import session state
 */
export function useGeoImport() {
  const [currentSession, setCurrentSession] = useState<ImportSession | null>(null);

  /**
   * Creates a new import session for a file
   */
  const createImportSession = useCallback(async (params: CreateImportSessionParams): Promise<ImportSession> => {
    logger.info('Creating import session', {
      fileId: params.fileId,
      hasFullDataset: !!params.fullDataset,
      hasPreviewDataset: !!params.previewDataset
    });
    
    const now = new Date().toISOString();
    const session: ImportSession = {
      id: crypto.randomUUID(),
      fileId: params.fileId,
      status: params.fullDataset ? 'completed' : 'created',
      fullDataset: params.fullDataset || null,
      previewDataset: params.previewDataset || null,
      selectedFeatures: [],
      createdAt: now,
      updatedAt: now
    };

    logger.info('Import session created', {
      fileId: session.fileId,
      status: session.status,
      featureCount: session.fullDataset?.features.length || 0,
      geometryTypes: session.fullDataset?.metadata?.geometryTypes || [],
      sourceSrid: session.fullDataset?.metadata?.srid
    });
    setCurrentSession(session);
    return session;
  }, []);

  /**
   * Generates a preview dataset from the full dataset
   * Applies sampling and geometry simplification based on the provided config
   */
  const generatePreview = useCallback(async (
    fullDataset: FullDataset,
    config: PreviewConfig = { maxFeatures: 500 }
  ): Promise<PreviewDataset> => {
    if (!fullDataset.features.length) {
      throw new Error('Dataset is empty');
    }

    // TODO: Implement preview generation with:
    // 1. Feature sampling
    // 2. Geometry simplification
    // 3. Preview dataset creation
    throw new Error('Preview generation not implemented');
  }, []);

  /**
   * Downloads a file from Supabase storage
   */
  const downloadFile = useCallback(async (fileId: string): Promise<ArrayBuffer> => {
    const { data, error } = await supabase.storage
      .from('geodata')
      .download(fileId);

    if (error) {
      logger.error('Failed to download file', { error, fileId });
      throw new Error(`Failed to download file: ${error.message}`);
    }

    if (!data) {
      logger.error('No data received from storage', { fileId });
      throw new Error('No data received from storage');
    }

    return await data.arrayBuffer();
  }, []);

  /**
   * Updates the current session state
   */
  const updateSession = useCallback((updates: Partial<ImportSession>) => {
    setCurrentSession(prev => {
      if (!prev) return null;
      const now = new Date().toISOString();
      return { 
        ...prev, 
        ...updates, 
        updatedAt: now 
      };
    });
  }, []);

  return {
    currentSession,
    createImportSession,
    generatePreview,
    downloadFile,
    updateSession,
  };
} 
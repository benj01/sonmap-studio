'use client';

import { useState, useEffect } from 'react';
import { useGeoImport } from '../hooks/use-geo-import';
import type { ImportSession, FullDataset } from '@/types/geo-import';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ShapefileParser } from '@/core/processors/shapefile-parser';
import { generatePreview } from '@/core/processors/preview-generator';
import { createClient } from '@/utils/supabase/client';
import { Progress } from '@/components/ui/progress';

interface GeoFileUploadProps {
  projectId: string;
  fileInfo?: {
    id?: string;  // Make id optional since it might not be available
    name: string;
    size: number;
    type: string;
  };
  onImportSessionCreated?: (session: ImportSession) => void;
}

interface CompanionFile {
  id: string;
  extension: string;
}

const logger = {
  info: (message: string, data?: any) => {
    console.log(`[GeoFileUpload] ${message}`, data || '');
  },
  warn: (message: string, error?: any) => {
    console.warn(`[GeoFileUpload] ⚠️ ${message}`, error || '');
  },
  error: (message: string, error?: any) => {
    console.error(`[GeoFileUpload] 🔴 ${message}`, error || '');
  },
  progress: (message: string, progress: number) => {
    console.log(`[GeoFileUpload] 📊 ${progress.toFixed(1)}% - ${message}`);
  }
};

/**
 * Component for handling geodata file parsing and import session creation
 */
export function GeoFileUpload({ 
  projectId,
  fileInfo,
  onImportSessionCreated
}: GeoFileUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const { createImportSession } = useGeoImport();
  const supabase = createClient();

  // Log component mount and props
  useEffect(() => {
    logger.info('Component mounted/updated with props:', {
      projectId,
      fileInfo
    });
  }, [projectId, fileInfo]);

  const downloadFile = async (fileId: string): Promise<ArrayBuffer> => {
    logger.info(`Starting file download: ${fileId}`);
    try {
      // First try to get the file path
      const { data: fileData, error: fileError } = await supabase
        .from('project_files')
        .select('storage_path')
        .eq('id', fileId)
        .single();

      if (fileError || !fileData?.storage_path) {
        logger.error('Failed to get file path', { fileId, error: fileError });
        throw new Error(`Failed to get file path: ${fileError?.message || 'File not found'}`);
      }

      // Now download using the storage path
      const { data, error } = await supabase
        .storage
        .from('project-files')
        .download(fileData.storage_path);
    
      if (error) {
        logger.error('Failed to download file', { 
          fileId, 
          path: fileData.storage_path,
          error 
        });
        throw new Error(`Failed to download file: ${error.message}`);
      }

      if (!data) {
        logger.error('No data received from download', { fileId, path: fileData.storage_path });
        throw new Error('No data received from download');
      }

      logger.info(`Successfully downloaded file: ${fileId}`, {
        path: fileData.storage_path,
        size: data.size
      });

      return await data.arrayBuffer();
    } catch (error) {
      logger.error('Download failed', { 
        fileId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  };

  const findCompanionFiles = async (baseName: string): Promise<CompanionFile[]> => {
    logger.info(`Looking for companion files for: ${baseName}`);
    const companions: CompanionFile[] = [];
    const extensions = ['.dbf', '.shx', '.prj'];

    try {
      // Query the database directly for companion files
      const { data: files, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_shapefile_component', true)
        .eq('main_file_id', fileInfo?.id);

      if (error) {
        logger.warn('Failed to query companion files', error);
        return companions;
      }

      logger.info('Found companion files in database:', files);

      // Map database results to companion files
      for (const file of (files || [])) {
        if (file.component_type && extensions.includes('.' + file.component_type)) {
          logger.info(`Found companion file: ${file.name}`, file);
          companions.push({
            id: file.id,
            extension: '.' + file.component_type
          });
        }
      }

      logger.info('Companion files mapped', {
        baseName,
        found: companions.map(c => ({
          extension: c.extension,
          id: c.id
        }))
      });

      return companions;
    } catch (error) {
      logger.error('Error finding companion files', error);
      return companions;
    }
  };

  const handleParseFile = async () => {
    if (!fileInfo?.id) {
      logger.warn('No file ID provided, cannot parse');
      return;
    }

    const startTime = Date.now();
    logger.info('Starting file processing', fileInfo);

    setError(null);
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Starting file processing...');

    try {
      // Get base name for finding companion files
      const baseName = fileInfo.name.replace(/\.shp$/, '');
      
      // Download main file
      setProgressMessage('Downloading main file...');
      logger.progress('Downloading main file...', 5);
      const mainFileData = await downloadFile(fileInfo.id);
      logger.info('Main file downloaded', { size: mainFileData.byteLength });

      // Find and download companion files
      setProgressMessage('Looking for companion files...');
      logger.progress('Looking for companion files...', 10);
      const companionFiles = await findCompanionFiles(baseName);
      
      // Download companion files
      const companions: Record<string, ArrayBuffer> = {};
      let companionProgress = 15;
      const progressPerFile = 10;

      for (const companion of companionFiles) {
        setProgressMessage(`Downloading ${companion.extension} file...`);
        logger.progress(`Downloading ${companion.extension} file...`, companionProgress);
        companions[companion.extension] = await downloadFile(companion.id);
        logger.info(`Companion file downloaded: ${companion.extension}`, {
          size: companions[companion.extension].byteLength
        });
        companionProgress += progressPerFile;
      }

      setProgressMessage('Creating parser...');
      logger.progress('Creating parser...', 40);
      // Create a parser instance
      const parser = new ShapefileParser();

      // Parse the file
      logger.info('Starting file parsing with companions:', {
        mainFileSize: mainFileData.byteLength,
        companions: Object.entries(companions).map(([ext, buf]) => ({
          extension: ext,
          size: buf.byteLength
        }))
      });

      const fullDataset = await parser.parse(mainFileData, companions, {
        maxFeatures: 10000 // Increased limit for full dataset
      }, (event) => {
        const currentProgress = 40 + (event.progress * 0.4); // 40-80% for parsing
        setProgress(currentProgress);
        if (event.message) {
          setProgressMessage(event.message);
          logger.progress(event.message, currentProgress);
        }
      });

      logger.info('File parsing complete', {
        features: fullDataset.features.length,
        metadata: fullDataset.metadata
      });

      // Generate preview dataset
      setProgressMessage('Generating preview...');
      logger.progress('Generating preview...', 80);
      setProgress(80);
      const previewDataset = generatePreview(fullDataset, {
        maxFeatures: 500,
        simplificationTolerance: 0.00001,
        randomSampling: true
      });
      setProgress(90);

      logger.info('Preview generation complete', {
        originalFeatures: fullDataset.features.length,
        previewFeatures: previewDataset.features.length
      });

      // Create import session
      setProgressMessage('Creating import session...');
      logger.progress('Creating import session...', 90);
      const session = await createImportSession({
        fileId: fileInfo.id,
        fileName: fileInfo.name,
        fileType: fileInfo.type,
        fullDataset,
        previewDataset
      });
      setProgress(100);
      logger.progress('Import session created', 100);

      const processingTime = Date.now() - startTime;
      logger.info('Processing complete', {
        processingTimeMs: processingTime,
        featuresProcessed: fullDataset.features.length,
        previewFeatures: previewDataset.features.length
      });

      onImportSessionCreated?.(session);
    } catch (error) {
      logger.error('Failed to parse file', error);
      console.error('Failed to parse file:', error);
      setError(error instanceof Error ? error.message : 'Failed to parse file');
    } finally {
      setIsProcessing(false);
    }
  };

  // Start parsing when component mounts
  useEffect(() => {
    if (fileInfo?.id) {
      logger.info('Starting file processing on mount', { fileId: fileInfo.id });
      handleParseFile();
    } else {
      logger.warn('No file ID available, skipping parse');
    }
  }, [fileInfo?.id]);

  return (
    <div className="w-full space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{progressMessage}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}
    </div>
  );
} 
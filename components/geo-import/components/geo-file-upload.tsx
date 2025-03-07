'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGeoImport } from '../hooks/use-geo-import';
import type { ImportSession, FullDataset } from '@/types/geo-import';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { generatePreview } from '@/core/processors/preview-generator';
import { createClient } from '@/utils/supabase/client';
import { Progress } from '@/components/ui/progress';
import { LogManager } from '@/core/logging/log-manager';
import { ParserFactory } from '@/core/processors/parser-factory';
import { FileTypeUtil } from '@/components/files/utils/file-types';

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

const SOURCE = 'GeoFileUpload';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  progress: (message: string, progress: number) => {
    logManager.info(SOURCE, `${progress.toFixed(1)}% - ${message}`);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
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
  const [hasProcessed, setHasProcessed] = useState(false);
  const { createImportSession } = useGeoImport();
  const supabase = createClient();
  const processedFiles = useRef(new Set<string>());
  const lastProgress = useRef(-1);
  const isProcessingRef = useRef(false);

  // Memoize fileInfo to prevent unnecessary re-renders
  const memoizedFileInfo = useMemo(() => {
    if (!fileInfo?.id || !fileInfo.name || !fileInfo.type) return null;
    return {
      id: fileInfo.id,
      name: fileInfo.name,
      type: fileInfo.type,
      size: fileInfo.size
    };
  }, [fileInfo?.id, fileInfo?.name, fileInfo?.type, fileInfo?.size]);

  // Log component mount and props
  useEffect(() => {
    logger.debug('Component mounted/updated', {
      hasFileInfo: !!fileInfo,
      fileName: fileInfo?.name
    });
  }, [projectId, fileInfo]);

  // Throttle progress reporting
  const reportProgress = useCallback((message: string, progress: number) => {
    if (Math.abs(progress - lastProgress.current) >= 5) {
      logger.debug(`Progress: ${progress.toFixed(1)}%`, { message });
      lastProgress.current = progress;
      setProgress(progress);
      setProgressMessage(message);
    }
  }, []);

  const downloadFile = async (fileId: string): Promise<ArrayBuffer> => {
    logger.info(`Downloading file`, { fileId });
    try {
      // First try to get the file path
      const { data: fileData, error: fileError } = await supabase
        .from('project_files')
        .select('storage_path')
        .eq('id', fileId)
        .single();

      if (fileError || !fileData?.storage_path) {
        logger.error('Failed to get file path', { fileId });
        throw new Error(`Failed to get file path: ${fileError?.message || 'File not found'}`);
      }

      // Now download using the storage path
      const { data, error } = await supabase
        .storage
        .from('project-files')
        .download(fileData.storage_path);
    
      if (error) {
        logger.error('Failed to download file', { fileId });
        throw new Error(`Failed to download file: ${error.message}`);
      }

      if (!data) {
        logger.error('No data received', { fileId });
        throw new Error('No data received from download');
      }

      logger.debug('Download successful', {
        fileId,
        size: data.size
      });

      return await data.arrayBuffer();
    } catch (error) {
      logger.error('Download failed', { fileId, error });
      throw error;
    }
  };

  const findCompanionFiles = useCallback(async (baseName: string): Promise<CompanionFile[]> => {
    const companions: CompanionFile[] = [];
    
    if (!memoizedFileInfo?.id) return companions;

    // Get required companion extensions for this file type
    const fileConfig = FileTypeUtil.getConfigForFile(memoizedFileInfo.name);
    if (!fileConfig?.companionFiles) return companions;

    const companionExtensions = fileConfig.companionFiles.map(c => c.extension);

    try {
      // Query the database directly for companion files
      const { data: files, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .eq('main_file_id', memoizedFileInfo.id);

      if (error) {
        logger.warn('Failed to query companion files');
        return companions;
      }

      // Map database results to companion files
      for (const file of (files || [])) {
        const extension = FileTypeUtil.getExtension(file.name);
        if (companionExtensions.includes(extension)) {
          logger.debug('Found companion file', {
            name: file.name,
            extension: extension
          });
          companions.push({
            id: file.id,
            extension: extension
          });
        }
      }

      return companions;
    } catch (error) {
      logger.error('Error finding companion files', error);
      return companions;
    }
  }, [projectId, memoizedFileInfo?.id, supabase]);

  // Start parsing when component mounts or when fileInfo changes
  useEffect(() => {
    if (!memoizedFileInfo || isProcessingRef.current || hasProcessed || processedFiles.current.has(memoizedFileInfo.id)) {
      return;
    }

    const parseFile = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      setIsProcessing(true);
      setError(null);
      reportProgress('Starting file processing...', 0);

      try {
        // Get base name for finding companion files
        const baseName = memoizedFileInfo.name.replace(/\.[^.]+$/, '');
        
        // Download main file
        reportProgress('Downloading main file...', 5);
        const mainFileData = await downloadFile(memoizedFileInfo.id);

        // Find and download companion files
        reportProgress('Looking for companion files...', 10);
        const companionFiles = await findCompanionFiles(baseName);
        
        // Download companion files
        const companions: Record<string, ArrayBuffer> = {};
        let companionProgress = 15;
        const progressPerFile = 10;

        for (const companion of companionFiles) {
          reportProgress(`Downloading ${companion.extension} file...`, companionProgress);
          companions[companion.extension] = await downloadFile(companion.id);
          companionProgress += progressPerFile;
        }

        reportProgress('Creating parser...', 40);
        const parser = ParserFactory.createParser(memoizedFileInfo.name);

        // Parse the file
        const fullDataset = await parser.parse(mainFileData, companions, {
          maxFeatures: 10000
        }, (event) => {
          const currentProgress = 40 + (event.progress * 0.4);
          if (event.message) {
            reportProgress(event.message, currentProgress);
          }
        });

        // Generate preview dataset
        reportProgress('Generating preview...', 80);
        const previewDataset = generatePreview(fullDataset, {
          maxFeatures: 500,
          simplificationTolerance: 0.00001,
          randomSampling: true
        });

        // Create import session
        reportProgress('Creating import session...', 90);
        const session = await createImportSession({
          fileId: memoizedFileInfo.id,
          fileName: memoizedFileInfo.name,
          fileType: memoizedFileInfo.type,
          fullDataset,
          previewDataset
        });

        reportProgress('Import session created', 100);
        processedFiles.current.add(memoizedFileInfo.id);
        setHasProcessed(true);
        onImportSessionCreated?.(session);
      } catch (error) {
        logger.error('Failed to parse file', error);
        setError(error instanceof Error ? error.message : 'Failed to parse file');
      } finally {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    };

    parseFile();
  }, [memoizedFileInfo, hasProcessed, createImportSession, reportProgress]);

  // Reset state when fileInfo changes
  useEffect(() => {
    if (memoizedFileInfo?.id && processedFiles.current.has(memoizedFileInfo.id)) {
      return;
    }
    setHasProcessed(false);
    setProgress(0);
    setProgressMessage('');
    setError(null);
  }, [memoizedFileInfo?.id]);

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
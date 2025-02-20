import { useState, useCallback } from 'react';
import { FileGroup, ProcessedFiles } from '@/components/files/types';
import { FileProcessor, FileProcessingError } from '@/components/files/utils/file-processor';

interface UseFileOperationsResult {
  isProcessing: boolean;
  error: string | null;
  processFiles: (files: File[]) => Promise<FileGroup[]>;
  processGroup: (group: FileGroup) => Promise<ProcessedFiles>;
}

export function useFileOperations(): UseFileOperationsResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback(async (files: File[]): Promise<FileGroup[]> => {
    setIsProcessing(true);
    setError(null);
    try {
      const groups = await FileProcessor.groupFiles(files);
      return groups;
    } catch (e) {
      const errorMessage = e instanceof FileProcessingError 
        ? e.message 
        : 'Failed to process files';
      setError(errorMessage);
      throw e;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const processGroup = useCallback(async (group: FileGroup): Promise<ProcessedFiles> => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = await FileProcessor.processFiles(group.mainFile, group.companions);
      return result;
    } catch (e) {
      const errorMessage = e instanceof FileProcessingError 
        ? e.message 
        : 'Failed to process file group';
      setError(errorMessage);
      throw e;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    isProcessing,
    error,
    processFiles,
    processGroup
  };
} 
import React from 'react';
import { FileUploader } from './file-uploader';
import { UploadProgress } from './upload-progress';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileActions } from '../../hooks/useFileActions';
import { FileGroup } from '../../types';
import { getSignedUploadUrl } from '@/utils/supabase/s3';
import { createClient } from '@/utils/supabase/client';
import { createLogger } from '../../utils/logger';

const SOURCE = 'S3FileUpload';
const logger = createLogger(SOURCE);

// Default to Supabase free plan limit
const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface S3FileUploadProps {
  projectId: string;
  onUploadComplete?: (file: any) => void;
  acceptedFileTypes?: string[];
  disabled?: boolean;
  maxFileSize?: number;
}

export function S3FileUpload({
  projectId,
  onUploadComplete,
  acceptedFileTypes,
  disabled,
  maxFileSize = DEFAULT_MAX_FILE_SIZE
}: S3FileUploadProps) {
  const { isProcessing, error, processFiles } = useFileOperations();
  const { handleUploadComplete } = useFileActions({ 
    projectId,
    onSuccess: (message) => console.log(message),
    onError: (error) => console.error(error)
  });
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [currentError, setCurrentError] = React.useState<string | null>(null);
  const supabase = createClient();
  const uploadAttempts = React.useRef(0);

  // Log component mount and state
  React.useEffect(() => {
    logger.info('S3FileUpload mounted/updated', {
      projectId,
      isProcessing,
      disabled,
      uploadProgress,
      hasError: !!currentError,
      uploadAttempts: uploadAttempts.current
    });
  }, [projectId, isProcessing, disabled, uploadProgress, currentError]);

  const checkFileExists = async (fileName: string): Promise<boolean> => {
    try {
      logger.info('Checking file existence', { fileName });
      const { data, error } = await supabase
        .from('project_files')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', fileName)
        .eq('is_shapefile_component', false)
        .maybeSingle();
      
      if (error) {
        logger.error('Error checking file existence', error);
        return false;
      }
      
      logger.info('File existence check result', {
        fileName,
        exists: !!data
      });
      return !!data;
    } catch (error) {
      logger.error('Error checking file existence', error);
      return false;
    }
  };

  const validateFileSize = (file: File): boolean => {
    if (file.size > maxFileSize) {
      setCurrentError(`File ${file.name} exceeds maximum size of ${maxFileSize / (1024 * 1024)}MB`);
      return false;
    }
    return true;
  };

  const uploadToS3 = async (fileGroup: FileGroup) => {
    try {
      console.info('[S3FileUpload] Starting upload process', {
        mainFile: fileGroup.mainFile.name,
        companions: fileGroup.companions.map(f => f.name)
      });

      // Check for existing files first
      const mainFileExists = await checkFileExists(fileGroup.mainFile.name);
      console.info('[S3FileUpload] File existence check', {
        fileName: fileGroup.mainFile.name,
        exists: mainFileExists
      });

      if (mainFileExists) {
        const error = `File ${fileGroup.mainFile.name} already exists in this project. Please delete the existing file first or choose a different name.`;
        console.warn('[S3FileUpload] File already exists', { fileName: fileGroup.mainFile.name });
        setCurrentError(error);
        return;
      }

      // Validate sizes before upload
      if (!validateFileSize(fileGroup.mainFile)) {
        console.warn('[S3FileUpload] Main file size validation failed', {
          fileName: fileGroup.mainFile.name,
          size: fileGroup.mainFile.size,
          maxSize: maxFileSize
        });
        return;
      }

      for (const companion of fileGroup.companions) {
        if (!validateFileSize(companion)) {
          console.warn('[S3FileUpload] Companion file size validation failed', {
            fileName: companion.name,
            size: companion.size,
            maxSize: maxFileSize
          });
          return;
        }
      }

      // Upload main file
      console.info('[S3FileUpload] Getting signed URL for main file', {
        fileName: fileGroup.mainFile.name
      });
      const mainFileUrl = await getSignedUploadUrl(fileGroup.mainFile.name, projectId);
      console.info('[S3FileUpload] Uploading main file', {
        fileName: fileGroup.mainFile.name,
        url: mainFileUrl
      });
      await uploadFileWithProgress(fileGroup.mainFile, mainFileUrl);

      // Upload companion files
      const companionUploads = fileGroup.companions.map(async (file) => {
        console.info('[S3FileUpload] Getting signed URL for companion file', {
          fileName: file.name
        });
        const url = await getSignedUploadUrl(file.name, projectId);
        console.info('[S3FileUpload] Uploading companion file', {
          fileName: file.name,
          url: url
        });
        await uploadFileWithProgress(file, url);
        return { name: file.name, size: file.size };
      });

      await Promise.all(companionUploads);
      console.info('[S3FileUpload] All files uploaded successfully');

      // Create file record in database
      console.info('[S3FileUpload] Creating database record', {
        fileName: fileGroup.mainFile.name
      });
      const result = await handleUploadComplete({
        id: '', // Will be assigned by the database
        name: fileGroup.mainFile.name,
        size: fileGroup.mainFile.size,
        type: fileGroup.mainFile.type,
        relatedFiles: Object.fromEntries(
          fileGroup.companions.map(file => [
            file.name.substring(file.name.lastIndexOf('.')),
            { name: file.name, size: file.size }
          ])
        )
      });

      onUploadComplete?.(result);
      console.info('[S3FileUpload] Upload process complete', {
        fileName: fileGroup.mainFile.name,
        result
      });
    } catch (error) {
      console.error('[S3FileUpload] Upload failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      let errorMessage = 'Upload failed';
      if (error instanceof Error) {
        if (error.message.includes('403')) {
          errorMessage = 'Upload not authorized. Please check if you are logged in.';
        } else if (error.message.includes('413')) {
          errorMessage = 'File too large for the current plan.';
        } else if (error.message.includes('already exists')) {
          errorMessage = 'File already exists in this project. Please delete the existing file first or choose a different name.';
        } else {
          errorMessage = error.message;
        }
      }
      setCurrentError(errorMessage);
      throw error;
    }
  };

  const uploadFileWithProgress = async (file: File, signedUrl: string) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100;
        setUploadProgress(percentComplete);
      }
    });

    return new Promise((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));

      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  };

  const handleFilesSelected = async (files: File[]) => {
    try {
      uploadAttempts.current += 1;
      logger.info('Files selected for upload', {
        fileCount: files.length,
        attempt: uploadAttempts.current,
        isProcessing,
        currentProgress: uploadProgress
      });

      setCurrentError(null);
      setUploadProgress(0);
      const groups = await processFiles(files);
      
      logger.info('Files processed into groups', {
        groupCount: groups.length,
        firstGroupFiles: groups[0] ? {
          main: groups[0].mainFile.name,
          companionCount: groups[0].companions.length
        } : null
      });

      if (groups.length > 0) {
        await uploadToS3(groups[0]);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to process files';
      logger.error('File selection failed', {
        error: errorMessage,
        attempt: uploadAttempts.current
      });
      setCurrentError(errorMessage);
    }
  };

  return (
    <div className="space-y-4">
      <FileUploader
        onFilesSelected={handleFilesSelected}
        acceptedFileTypes={acceptedFileTypes}
        disabled={disabled || isProcessing}
        maxFileSize={maxFileSize}
      />
      
      {(error || currentError) && (
        <div className="text-red-500 text-sm">
          {error || currentError}
        </div>
      )}

      {isProcessing && uploadProgress > 0 && (
        <UploadProgress progress={uploadProgress} />
      )}

      {maxFileSize === DEFAULT_MAX_FILE_SIZE && (
        <div className="text-sm text-gray-500">
          Note: Free plan has a 50MB file size limit. Upgrade to Pro for files up to 50GB.
        </div>
      )}
    </div>
  );
} 
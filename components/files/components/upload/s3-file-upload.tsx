import React from 'react';
import { FileUploader } from './file-uploader';
import { UploadProgress } from './upload-progress';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileActions } from '../../hooks/useFileActions';
import type { FileGroup } from '../../types';
import { getSignedUploadUrl } from '@/utils/supabase/s3';
import { createClient } from '@/utils/supabase/client';

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

  const checkFileExists = async (fileName: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('project_files')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', fileName)
        .eq('is_shapefile_component', false)  // Only check main files
        .maybeSingle();  // Use maybeSingle instead of single to avoid errors
      
      if (error) {
        console.error('Error checking file existence:', error);
        return false;
      }
      
      return !!data;
    } catch (error) {
      console.error('Error checking file existence:', error);
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
      // Check for existing files first
      const mainFileExists = await checkFileExists(fileGroup.mainFile.name);
      if (mainFileExists) {
        setCurrentError(`File ${fileGroup.mainFile.name} already exists in this project. Please delete the existing file first or choose a different name.`);
        return;
      }

      // Validate sizes before upload
      if (!validateFileSize(fileGroup.mainFile)) return;
      for (const file of fileGroup.companions.values()) {
        if (!validateFileSize(file)) return;
      }

      // Upload main file
      const mainFileUrl = await getSignedUploadUrl(fileGroup.mainFile.name, projectId);
      await uploadFileWithProgress(fileGroup.mainFile, mainFileUrl);

      // Upload companion files
      const companionUploads = Array.from(fileGroup.companions.entries()).map(
        async ([extension, file]) => {
          const url = await getSignedUploadUrl(file.name, projectId);
          await uploadFileWithProgress(file, url);
          return { extension, name: file.name, size: file.size };
        }
      );

      await Promise.all(companionUploads);

      // Create file record in database
      const result = await handleUploadComplete({
        id: '', // Will be assigned by the database
        name: fileGroup.mainFile.name,
        size: fileGroup.mainFile.size,
        type: fileGroup.mainFile.type,
        relatedFiles: Object.fromEntries(
          Array.from(fileGroup.companions.entries()).map(([ext, file]) => [
            ext,
            { name: file.name, size: file.size }
          ])
        )
      });

      onUploadComplete?.(result);
      console.log('Upload complete:', fileGroup.mainFile.name);
    } catch (error) {
      let errorMessage = 'Upload failed';
      if (error instanceof Error) {
        // Handle specific error cases
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
      console.error('Upload failed:', error);
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
      setCurrentError(null);
      setUploadProgress(0);
      const groups = await processFiles(files);
      if (groups.length > 0) {
        await uploadToS3(groups[0]);
      }
    } catch (e) {
      setCurrentError(e instanceof Error ? e.message : 'Failed to process files');
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
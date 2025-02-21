import React from 'react';
import { FileList } from './file-list';
import { EmptyState } from './empty-state';
import { Toolbar } from './toolbar';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileActions } from '../../hooks/useFileActions';
import { FileGroup, ProcessedFiles, ProjectFile } from '../../types';
import { Button } from '@/components/ui/button';
import { UploadProgress } from '../upload/upload-progress';

interface FileManagerProps {
  projectId: string;
  onFilesProcessed?: (files: ProcessedFiles) => void;
  onError?: (error: string) => void;
}

export function FileManager({ projectId, onFilesProcessed, onError }: FileManagerProps) {
  const { isProcessing, error, processFiles, processGroup } = useFileOperations();
  const { isLoading, loadFiles, handleDelete, handleDownload, handleUploadComplete } = useFileActions({
    projectId,
    onError: (msg) => onError?.(msg)
  });
  const [selectedGroup, setSelectedGroup] = React.useState<FileGroup | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isUploading, setIsUploading] = React.useState(false);
  const [files, setFiles] = React.useState<ProjectFile[]>([]);

  // Load files on component mount
  React.useEffect(() => {
    loadExistingFiles();
  }, [projectId]);

  const loadExistingFiles = async () => {
    try {
      const loadedFiles = await loadFiles();
      setFiles(loadedFiles);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load files';
      onError?.(errorMessage);
    }
  };

  const handleFileSelect = async (files: FileList) => {
    try {
      const fileArray = Array.from(files) as File[];
      const groups = await processFiles(fileArray);
      
      if (groups.length > 0) {
        setSelectedGroup(groups[0]);
        const processed = await processGroup(groups[0]);
        onFilesProcessed?.(processed);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to process files';
      onError?.(errorMessage);
    }
  };

  const handleUpload = async () => {
    if (!selectedGroup) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Upload main file
      const mainFileResult = await uploadFile(selectedGroup.mainFile);
      
      // Upload companion files and collect their info
      const relatedFiles: Record<string, { name: string; size: number }> = {};
      for (const companion of selectedGroup.companions) {
        const ext = companion.name.substring(companion.name.lastIndexOf('.'));
        await uploadFile(companion);
        relatedFiles[ext] = {
          name: companion.name,
          size: companion.size
        };
      }

      // Create file record
      await handleUploadComplete({
        id: '', // Will be assigned by the database
        name: selectedGroup.mainFile.name,
        size: selectedGroup.mainFile.size,
        type: selectedGroup.mainFile.type,
        relatedFiles: Object.keys(relatedFiles).length > 0 ? relatedFiles : undefined
      });

      setSelectedGroup(null);
      setUploadProgress(100);
      
      // Reload files after successful upload
      await loadExistingFiles();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to upload files';
      onError?.(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      await handleDelete(fileId);
      // Reload files after successful deletion
      await loadExistingFiles();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to delete file';
      onError?.(errorMessage);
    }
  };

  const uploadFile = async (file: File) => {
    try {
      console.log('Requesting signed URL for:', file.name);
      const response = await fetch(
        `/api/storage/upload-url-new?filename=${encodeURIComponent(file.name)}&projectId=${encodeURIComponent(projectId)}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to get signed URL:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Failed to get signed URL: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Received signed URL response:', data);

      if (!data.data?.signedUrl) {
        console.error('Invalid signed URL response:', data);
        throw new Error('Invalid signed URL response from server');
      }

      const { signedUrl } = data.data;
      
      console.log('Uploading file using signed URL...');
      const xhr = new XMLHttpRequest();
      await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            setUploadProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            console.log('Upload successful');
            resolve(xhr.response);
          } else {
            console.error('Upload failed:', {
              status: xhr.status,
              response: xhr.responseText
            });
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          console.error('Upload error:', xhr.statusText);
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        });

        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    } catch (error) {
      console.error('Upload process error:', error);
      throw error;
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Toolbar 
        onFileSelect={handleFileSelect} 
        isProcessing={isProcessing}
      />
      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}
      {isLoading ? (
        <div className="text-center py-4">Loading files...</div>
      ) : files.length > 0 ? (
        <div className="space-y-4">
          <div className="font-medium text-gray-700">Uploaded Files</div>
          {/* Group files by main file and companions */}
          {files.filter(file => !file.is_shapefile_component).map((mainFile) => (
            <FileList
              key={mainFile.id}
              mainFile={mainFile}
              companions={files.filter(f => f.main_file_id === mainFile.id)}
              onDelete={() => handleFileDelete(mainFile.id)}
              onDownload={() => handleDownload(mainFile.id)}
            />
          ))}
        </div>
      ) : selectedGroup ? (
        <div className="space-y-4">
          <div className="font-medium text-gray-700">Selected Files</div>
          <FileList
            mainFile={selectedGroup.mainFile}
            companions={selectedGroup.companions}
            onDelete={handleDelete}
            onDownload={handleDownload}
          />
          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload Files'}
            </Button>
          </div>
          {isUploading && (
            <UploadProgress progress={uploadProgress} />
          )}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
} 
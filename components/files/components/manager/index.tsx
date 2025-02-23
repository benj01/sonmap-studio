import React from 'react';
import { FileList } from './file-list';
import { EmptyState } from './empty-state';
import { Toolbar } from './toolbar';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileActions } from '../../hooks/useFileActions';
import { FileGroup, ProcessedFiles, ProjectFile } from '../../types';
import { Button } from '@/components/ui/button';
import { UploadProgress } from '../upload/upload-progress';
import { GeoImportDialog } from '@/components/geo-import/components/geo-import-dialog';
import { FileTypeUtil } from '../../utils/file-types';

interface FileManagerProps {
  projectId: string;
  onFilesProcessed?: (files: ProcessedFiles) => void;
  onError?: (error: string) => void;
}

interface ImportFileInfo extends ProjectFile {
  type: string;
}

interface UploadingFile {
  group: FileGroup;
  progress: number;
}

const SOURCE = 'FileManager';

export function FileManager({ projectId, onFilesProcessed, onError }: FileManagerProps) {
  const { isProcessing, error, processFiles, processGroup } = useFileOperations();
  const { isLoading, loadFiles, handleDelete, handleDownload, handleUploadComplete } = useFileActions({
    projectId,
    onError: (msg) => onError?.(msg)
  });
  const [uploadingFiles, setUploadingFiles] = React.useState<UploadingFile[]>([]);
  const [files, setFiles] = React.useState<ProjectFile[]>([]);
  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<ImportFileInfo | null>(null);

  // Load files on component mount
  React.useEffect(() => {
    loadExistingFiles();
  }, [projectId]);

  const loadExistingFiles = async () => {
    try {
      console.info('[FileManager] Loading existing files');
      const loadedFiles = await loadFiles();
      console.info('[FileManager] Files loaded', {
        count: loadedFiles.length,
        files: loadedFiles.map(f => f.name)
      });
      setFiles(loadedFiles);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load files';
      onError?.(errorMessage);
    }
  };

  const handleFileSelect = async (files: FileList) => {
    // Skip if already processing
    if (isProcessing) {
      console.info('[FileManager] Skipping file selection - already processing');
      return;
    }

    try {
      console.info('[FileManager] File selection started', {
        fileCount: files.length,
        fileNames: Array.from(files).map(f => f.name)
      });

      const fileArray = Array.from(files) as File[];
      
      // Check if any of these files are already being uploaded
      const duplicateFiles = fileArray.filter(file => 
        uploadingFiles.some(uf => uf.group.mainFile.name === file.name)
      );

      if (duplicateFiles.length > 0) {
        console.warn('[FileManager] Skipping duplicate files', {
          files: duplicateFiles.map(f => f.name)
        });
        onError?.('Some files are already being uploaded. Please wait for them to complete.');
        return;
      }

      console.info('[FileManager] Processing files', {
        files: fileArray.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type
        }))
      });

      const groups = await processFiles(fileArray);
      console.info('[FileManager] Files processed into groups', {
        groupCount: groups.length,
        groups: groups.map(g => ({
          mainFile: g.mainFile.name,
          companionCount: g.companions.length,
          companions: g.companions.map(c => c.name)
        }))
      });
      
      if (groups.length > 0) {
        // Add new groups to uploading files
        setUploadingFiles(prev => [
          ...prev,
          ...groups.map(group => ({
            group,
            progress: 0
          }))
        ]);

        // Process and upload each group sequentially
        for (const group of groups) {
          console.info('[FileManager] Processing group', {
            mainFile: group.mainFile.name,
            companions: group.companions.map(c => c.name)
          });
          
          const processed = await processGroup(group);
          onFilesProcessed?.(processed);

          if (processed.main.isValid !== false) {
            console.info('[FileManager] Starting upload for valid group', {
              mainFile: group.mainFile.name
            });
            await handleUpload(group);
          } else {
            console.warn('[FileManager] Skipping upload - file validation failed', {
              mainFile: group.mainFile.name,
              error: processed.main.error
            });
            // Remove failed group from uploading files
            setUploadingFiles(prev => prev.filter(uf => uf.group.mainFile.name !== group.mainFile.name));
          }
        }
      } else {
        console.warn('[FileManager] No valid file groups found after processing');
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to process files';
      console.error('[FileManager] File selection failed', {
        error: errorMessage,
        stack: e instanceof Error ? e.stack : undefined
      });
      onError?.(errorMessage);
    }
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      await handleDelete(fileId);
      await loadExistingFiles(); // Reload files after deletion
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to delete file';
      onError?.(errorMessage);
    }
  };

  const handleFileImport = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      const fileType = FileTypeUtil.getConfigForFile(file.name);
      setSelectedFile({
        ...file,
        type: fileType?.mimeType || 'application/octet-stream'
      });
      setImportDialogOpen(true);
    }
  };

  const handleImportComplete = async (result: any) => {
    try {
      console.info('Import completed', result);
      setImportDialogOpen(false);
      setSelectedFile(null);
      await loadExistingFiles(); // Reload files after import
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to complete import';
      onError?.(errorMessage);
    }
  };

  const updateUploadProgress = (fileName: string, progress: number) => {
    setUploadingFiles(prev => prev.map(uf => 
      uf.group.mainFile.name === fileName 
        ? { ...uf, progress }
        : uf
    ));
  };

  const uploadFile = async (file: File, onProgress: (progress: number) => void) => {
    const logContext = `[${file.name}]`;
    try {
      const contentType = file.name.toLowerCase().endsWith('.geojson') 
        ? 'application/geo+json'
        : file.type || 'application/octet-stream';

      // Single log for upload start with all relevant info
      console.info(`[FileManager] ${logContext} Starting upload`, { 
        size: file.size,
        type: contentType
      });
      
      // Get signed URL
      const response = await fetch('/api/storage/upload-url-new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          projectId: projectId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get signed URL: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.data?.signedUrl) {
        throw new Error('Invalid signed URL response from server');
      }

      const { signedUrl } = data.data;
      
      // Upload the file
      const xhr = new XMLHttpRequest();
      await new Promise((resolve, reject) => {
        // Only log progress at 25%, 50%, 75%, and 100%
        let lastProgressLog = 0;
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            onProgress(percentComplete);
            
            // Log progress at 25% intervals
            const currentQuarter = Math.floor(percentComplete / 25);
            if (currentQuarter > lastProgressLog) {
              lastProgressLog = currentQuarter;
              console.info(`[FileManager] ${logContext} Upload progress: ${Math.round(percentComplete)}%`);
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            console.info(`[FileManager] ${logContext} Upload completed`);
            resolve(xhr.response);
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        });

        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(file);
      });
    } catch (error) {
      console.error(`[FileManager] ${logContext} Upload failed`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  };

  const handleUpload = async (group: FileGroup) => {
    const mainFileName = group.mainFile.name;
    const logContext = `[${mainFileName}]`;
    
    try {
      console.info(`[FileManager] ${logContext} Starting upload process`, {
        companions: group.companions.map(c => c.name)
      });

      // Upload main file first
      console.info(`[FileManager] ${logContext} Uploading main file`);
      await uploadFile(group.mainFile, (progress) => {
        updateUploadProgress(mainFileName, progress);
      });
      
      // Upload companion files if any
      const relatedFiles: Record<string, { name: string; size: number }> = {};
      if (group.companions.length > 0) {
        for (const companion of group.companions) {
          const ext = companion.name.substring(companion.name.lastIndexOf('.'));
          console.info(`[FileManager] ${logContext} Uploading companion file ${ext}`);
          await uploadFile(companion, (progress) => {
            updateUploadProgress(mainFileName, progress);
          });
          relatedFiles[ext] = {
            name: companion.name,
            size: companion.size
          };
        }
      }

      // Create database record
      console.info(`[FileManager] ${logContext} Creating database record`);
      await handleUploadComplete({
        id: '',
        name: group.mainFile.name,
        size: group.mainFile.size,
        type: group.mainFile.type,
        relatedFiles: Object.keys(relatedFiles).length > 0 ? relatedFiles : undefined
      });

      // Cleanup and reload
      setUploadingFiles(prev => prev.filter(uf => uf.group.mainFile.name !== mainFileName));
      await loadExistingFiles();
      
      console.info(`[FileManager] ${logContext} Upload process completed`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to upload files';
      console.error(`[FileManager] ${logContext} Upload process failed`, {
        error: errorMessage,
        stack: e instanceof Error ? e.stack : undefined
      });
      onError?.(errorMessage);
      
      setUploadingFiles(prev => prev.filter(uf => uf.group.mainFile.name !== mainFileName));
      await loadExistingFiles();
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
      
      {/* Show both existing and uploading files */}
      <div className="space-y-6">
        {/* Uploading Files Section */}
        {uploadingFiles.length > 0 && (
          <div className="space-y-4">
            <div className="font-medium text-gray-700">Uploading Files</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadingFiles.map((uploadingFile) => (
                <div key={uploadingFile.group.mainFile.name}>
                  <FileList
                    mainFile={uploadingFile.group.mainFile}
                    companions={uploadingFile.group.companions}
                  />
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between items-center text-sm text-gray-600">
                      <span>Uploading...</span>
                      <span>{Math.round(uploadingFile.progress)}%</span>
                    </div>
                    <UploadProgress progress={uploadingFile.progress} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Existing Files Section */}
        {isLoading ? (
          <div className="text-center py-4">Loading files...</div>
        ) : files.length > 0 ? (
          <div className="space-y-4">
            <div className="font-medium text-gray-700">Uploaded Files</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.filter(file => !file.is_shapefile_component).map((mainFile) => (
                <FileList
                  key={mainFile.id}
                  mainFile={mainFile}
                  companions={files.filter(f => f.main_file_id === mainFile.id)}
                  onDelete={handleFileDelete}
                  onDownload={handleDownload}
                  onImport={handleFileImport}
                />
              ))}
            </div>
          </div>
        ) : uploadingFiles.length === 0 && (
          <EmptyState />
        )}
      </div>

      <GeoImportDialog
        projectId={projectId}
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={handleImportComplete}
        fileInfo={selectedFile ? {
          id: selectedFile.id,
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type
        } : undefined}
      />
    </div>
  );
} 
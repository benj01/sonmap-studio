import React, { useState, useCallback } from 'react';
import { FileList } from './file-list';
import { EmptyState } from './empty-state';
import { Toolbar } from './toolbar';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileActions } from '../../hooks/useFileActions';
import { FileGroup, ProcessedFiles, ProjectFile } from '../../types';
import { Button } from '../../../ui/button';
import { UploadProgress } from './upload-progress';
import { GeoImportDialog } from '../../../geo-import/components/geo-import-dialog';
import { FileTypeUtil } from '../../utils/file-types';
import { Upload } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { createClient } from '../../../../utils/supabase/client';
import { ImportedFilesList } from '../imported-files-list';
import { DeleteConfirmationDialog } from '../delete-confirmation-dialog';
import { ImportFileInfo } from '@/types/files';

interface FileManagerProps {
  projectId: string;
  onFilesProcessed?: (files: ProcessedFiles) => void;
  onError?: (error: string) => void;
}

interface UploadingFile {
  group: FileGroup;
  progress: number;
}

interface FileListProps {
  files: ProjectFile[];
  onDelete: (file: ProjectFile) => Promise<void>;
  onImport: (fileId: string) => Promise<void>;
  isLoading: boolean;
}

const SOURCE = 'FileManager';

export function FileManager({ projectId, onFilesProcessed, onError }: FileManagerProps) {
  const { isProcessing, error, processFiles, processGroup } = useFileOperations();
  const { isLoading, loadFiles, handleDelete, handleDownload, handleUploadComplete } = useFileActions({
    projectId,
    onError: (msg) => onError?.(msg)
  });
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ImportFileInfo | undefined>();
  const [importedFilesKey, setImportedFilesKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = React.useRef<HTMLDivElement>(null);
  const dragCountRef = React.useRef(0);
  const [fileToDelete, setFileToDelete] = useState<ProjectFile | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
        files: loadedFiles.map((file: ProjectFile) => file.name)
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

  const handleFileDelete = useCallback(async (file: ProjectFile, deleteRelated: boolean) => {
    try {
      await handleDelete(file.id, deleteRelated);
      const updatedFiles = await loadFiles();
      setFiles(updatedFiles);
      // Force the ImportedFilesList to refresh by changing its key
      setImportedFilesKey(prev => prev + 1);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to delete file';
      onError?.(errorMessage);
    }
  }, [handleDelete, loadFiles, onError]);

  const handleFileImport = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      const fileType = FileTypeUtil.getConfigForFile(file.name);
      setSelectedFile({
        id: file.id,
        name: file.name,
        size: file.size,
        type: fileType?.mimeType || 'application/octet-stream'
      });
      setImportDialogOpen(true);
    }
  };

  const handleImportComplete = async (result: any) => {
    try {
      console.info('Import completed', result);
      
      // Don't close the dialog until we've updated everything
      const supabase = createClient();
      
      // Refresh both lists to ensure we have the latest data
      await Promise.all([
        loadExistingFiles(),
        // Force the ImportedFilesList to refresh by changing its key
        setImportedFilesKey(prev => prev + 1)
      ]);

      // Now close the dialog and reset selected file
      setImportDialogOpen(false);
      setSelectedFile(undefined);
      
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
      const extension = file.name.toLowerCase();
      const contentType = extension.endsWith('.geojson') 
        ? 'application/geo+json'
        : extension.endsWith('.qmd')
        ? 'application/xml'
        : file.type || 'application/octet-stream';

      console.info(`[FileManager] ${logContext} Starting upload`, { 
        size: file.size,
        type: contentType,
        extension
      });
      
      // Get signed URL
      console.info(`[FileManager] ${logContext} Requesting signed URL...`);
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        const error = new Error('Authentication required');
        console.error(`[FileManager] ${logContext} No valid session`, { 
          error: sessionError,
          errorMessage: error.message 
        });
        throw error;
      }

      const response = await fetch('/api/storage/upload-url-new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          filename: file.name,
          projectId: projectId,
          contentType: contentType
        }),
      });

      let responseData;
      const responseText = await response.text();
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error(`[FileManager] ${logContext} Failed to parse response`, {
          text: responseText,
          error: e
        });
      }

      if (!response.ok) {
        const error = new Error(
          `Failed to get signed URL: ${response.status} ${response.statusText} - ${
            responseData?.error || responseText
          }`
        );
        console.error(`[FileManager] ${logContext} Failed to get signed URL`, {
          status: response.status,
          statusText: response.statusText,
          response: responseData || responseText,
          error: error.message
        });
        throw error;
      }

      if (!responseData?.data?.signedUrl) {
        const error = new Error(
          'Invalid signed URL response from server: ' + JSON.stringify(responseData)
        );
        console.error(`[FileManager] ${logContext} Invalid signed URL response`, { 
          data: responseData,
          error: error.message
        });
        throw error;
      }

      const { signedUrl } = responseData.data;
      console.info(`[FileManager] ${logContext} Got signed URL, starting upload to storage...`);
      
      // Upload the file
      const xhr = new XMLHttpRequest();
      await new Promise((resolve, reject) => {
        let lastProgressLog = 0;
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            onProgress(percentComplete);
            
            const currentQuarter = Math.floor(percentComplete / 25);
            if (currentQuarter > lastProgressLog) {
              lastProgressLog = currentQuarter;
              console.info(`[FileManager] ${logContext} Upload progress: ${Math.round(percentComplete)}%`);
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.info(`[FileManager] ${logContext} Upload completed successfully`);
            resolve(undefined);
          } else {
            const error = new Error(
              `Upload failed with status ${xhr.status}: ${xhr.statusText} - ${xhr.responseText}`
            );
            console.error(`[FileManager] ${logContext} Upload failed`, {
              status: xhr.status,
              statusText: xhr.statusText,
              response: xhr.responseText,
              error: error.message
            });
            reject(error);
          }
        });

        xhr.addEventListener('error', () => {
          const error = new Error(`Upload failed: Network error - ${xhr.statusText}`);
          console.error(`[FileManager] ${logContext} Network error during upload`, {
            status: xhr.status,
            statusText: xhr.statusText,
            response: xhr.responseText,
            error: error.message
          });
          reject(error);
        });

        xhr.addEventListener('abort', () => {
          const error = new Error('Upload aborted');
          console.error(`[FileManager] ${logContext} Upload aborted`, {
            error: error.message
          });
          reject(error);
        });

        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(file);
      });
    } catch (error) {
      console.error(`[FileManager] ${logContext} Upload failed`, {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : 'Unknown error',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      throw error;
    }
  };

  const handleUpload = async (group: FileGroup) => {
    const mainFileName = group.mainFile.name;
    const logContext = `[${mainFileName}]`;
    
    try {
      console.info(`[FileManager] ${logContext} Starting upload process`, {
        mainFile: {
          name: group.mainFile.name,
          type: group.mainFile.type,
          size: group.mainFile.size
        },
        companions: group.companions.map((companion: File) => ({
          name: companion.name,
          type: companion.type,
          size: companion.size
        }))
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
          const ext = FileTypeUtil.getExtension(companion.name);
          console.info(`[FileManager] ${logContext} Uploading companion file`, {
            name: companion.name,
            extension: ext,
            type: companion.type,
            size: companion.size
          });
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
      console.info(`[FileManager] ${logContext} Creating database record`, {
        mainFile: group.mainFile.name,
        relatedFiles
      });
      await handleUploadComplete({
        id: '',
        name: group.mainFile.name,
        size: group.mainFile.size,
        type: group.mainFile.type,
        relatedFiles: Object.fromEntries(
          group.companions.map((companion: File) => [
            FileTypeUtil.getExtension(companion.name),
            { name: companion.name, size: companion.size }
          ])
        )
      });

      // Cleanup and reload
      setUploadingFiles(prev => prev.filter(uf => uf.group.mainFile.name !== mainFileName));
      await loadExistingFiles();
      
      console.info(`[FileManager] ${logContext} Upload process completed`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to upload files';
      console.error(`[FileManager] ${logContext} Upload process failed`, {
        error: e instanceof Error ? {
          message: e.message,
          stack: e.stack
        } : 'Unknown error',
        fileName: mainFileName,
        fileType: group.mainFile.type,
        fileSize: group.mainFile.size
      });
      onError?.(errorMessage);
      
      setUploadingFiles(prev => prev.filter(uf => uf.group.mainFile.name !== mainFileName));
      await loadExistingFiles();
    }
  };

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    if (dragCountRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsDragging(false);
    
    const files = e.dataTransfer?.files;
    if (files?.length) {
      handleFileSelect(files);
    }
  }, [handleFileSelect]);

  const handleViewLayer = (layerId: string) => {
    // TODO: Implement layer viewing functionality
    console.info('View layer requested', { layerId });
  };

  const handleDeleteImported = async (fileId: string) => {
    try {
      await handleDelete(fileId);
      const updatedFiles = await loadFiles();
      setFiles(updatedFiles);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to delete imported file';
      onError?.(errorMessage);
    }
  };

  const handleCompanionClick = useCallback((companion: ProjectFile) => {
    setSelectedFile(companion as ImportFileInfo);
  }, []);

  const handleImportedFileClick = useCallback((file: ProjectFile) => {
    setSelectedFile(file as ImportFileInfo);
  }, []);

  return (
    <div className={cn('relative min-h-[200px] rounded-lg border bg-card', {
      'border-primary': isDragging
    })}>
      <div ref={dropZoneRef} className="p-4 space-y-4">
        <Toolbar onFileSelect={handleFileSelect} isProcessing={isProcessing} />
        
        {/* Uploaded Files */}
        <FileList
          files={files.filter(f => !f.main_file_id)}
          onDelete={handleFileDelete}
          onImport={handleFileImport}
          isLoading={isLoading}
        />

        {/* Upload Progress */}
        {uploadingFiles.length > 0 && (
          <UploadProgress files={uploadingFiles} />
        )}

        {/* Imported Files */}
        <ImportedFilesList
          key={importedFilesKey}
          projectId={projectId}
          onViewLayer={handleViewLayer}
          onDelete={handleFileDelete}
        />

        {/* Import Dialog */}
        <GeoImportDialog
          projectId={projectId}
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImportComplete={handleImportComplete}
          fileInfo={selectedFile}
        />
      </div>
    </div>
  );
}

// ... rest of the code ...
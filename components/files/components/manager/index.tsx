import React, { useState, useCallback, useEffect } from 'react';
import { FileList } from './file-list';
import { EmptyState } from './empty-state';
import { Toolbar } from './toolbar';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileActions } from '../../hooks/useFileActions';
import { FileGroup, ProcessedFiles, ProjectFile } from '../../types';
import { Button } from '../../../ui/button';
import { UploadProgress } from './upload-progress';
// import { GeoImportDialog } from '../../../geo-import/components/geo-import-dialog'; // Legacy dialog
import { ImportWizard } from '../../../geo-import/wizard/ImportWizard';
import { FileTypeUtil } from '../../utils/file-types';
import { Upload } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { createClient } from '@/utils/supabase/client';
import { ImportedFilesList, ImportedFilesListRef } from '../imported-files-list';
import { DeleteConfirmationDialog } from '../delete-confirmation-dialog';
import { ImportFileInfo } from '@/types/files';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { FileProcessor, FileProcessingError } from '../../utils/file-processor';
import { FileValidator } from '../../utils/validation';
import { useUserSettings } from '@/hooks/useUserSettings';
import { toast } from 'react-hot-toast';
import { UploadErrorDialog } from '../upload-error-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../ui/dialog';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
const logManager = LogManager.getInstance();
const LOG_SOURCE = 'FileManager';
logManager.setComponentLogLevel(LOG_SOURCE, LogLevel.INFO);

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
  const importedFilesRef = React.useRef<ImportedFilesListRef>(null);
  const { settings } = useUserSettings();
  const [uploadError, setUploadError] = useState<{ message: string; fileName?: string; fileSize?: number } | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [uploadedOpen, setUploadedOpen] = useState(true);
  const [importedOpen, setImportedOpen] = useState(true);
  const [importWizardFile, setImportWizardFile] = useState<ImportFileInfo | undefined>();
  const [importWizardStep, setImportWizardStep] = useState<number>(0);

  const loadExistingFiles = useCallback(async () => {
    if (!projectId) {
      logManager.warn(LOG_SOURCE, 'No project ID provided');
      return;
    }

    try {
      logManager.debug(LOG_SOURCE, 'Loading existing files', { projectId });
      const loadedFiles = await loadFiles();
      
      if (!loadedFiles) {
        logManager.warn(LOG_SOURCE, 'No files returned from loadFiles', { projectId });
        setFiles([]);
        return;
      }

      logManager.debug(LOG_SOURCE, 'Files loaded', {
        projectId,
        totalFiles: loadedFiles.length,
        mainFiles: loadedFiles.filter(f => !f.companions).length,
        companionFiles: loadedFiles.filter(f => f.companions).length
      });
      setFiles(loadedFiles);
    } catch (error) {
      logManager.error(LOG_SOURCE, 'Error loading files', { projectId, error });
      setFiles([]);
    }
  }, [projectId, loadFiles]);

  // Load files on component mount
  useEffect(() => {
    if (projectId) {
      loadExistingFiles();
    }
  }, [projectId, loadExistingFiles]);

  const handleFileSelect = async (files: FileList) => {
    if (isProcessing) {
      logManager.debug(LOG_SOURCE, 'Skipping file selection - already processing');
      return;
    }

    try {
      logManager.debug(LOG_SOURCE, 'File selection started', {
        count: files.length
      });

      const fileArray = Array.from(files) as File[];
      
      const duplicateFiles = fileArray.filter(file => 
        uploadingFiles.some(uf => uf.group.mainFile.name === file.name)
      );

      if (duplicateFiles.length > 0) {
        logManager.warn(LOG_SOURCE, 'Skipping duplicate files', {
          files: duplicateFiles.map(f => f.name)
        });
        onError?.('Some files are already being uploaded. Please wait for them to complete.');
        return;
      }

      logManager.debug(LOG_SOURCE, 'Processing files', {
        count: fileArray.length
      });

      const groups = await processFiles(fileArray);
      logManager.debug(LOG_SOURCE, 'Files processed into groups', {
        groupCount: groups.length,
        groups: groups.map(group => ({
          mainFile: group.mainFile.name,
          companions: group.companions.map((companion: File) => companion.name)
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
          logManager.debug(LOG_SOURCE, 'Processing group', {
            mainFile: group.mainFile.name,
            companions: group.companions.map(c => c.name)
          });
          
          const processed = await processGroup(group);
          onFilesProcessed?.(processed);

          if (processed.main.isValid !== false) {
            logManager.info(LOG_SOURCE, 'Starting upload for valid group', {
              mainFile: group.mainFile.name
            });
            await handleUpload(group);
          } else {
            logManager.warn(LOG_SOURCE, 'Skipping upload - file validation failed', {
              mainFile: group.mainFile.name,
              error: processed.main.error
            });
            // Remove failed group from uploading files
            setUploadingFiles(prev => prev.filter(uf => uf.group.mainFile.name !== group.mainFile.name));
          }
        }
      } else {
        logManager.warn(LOG_SOURCE, 'No valid file groups found after processing');
      }
    } catch (error) {
      logManager.error(LOG_SOURCE, 'File selection failed', { error });
      onError?.(error instanceof Error ? error.message : 'Failed to process files');
    }
  };

  const handleFileDelete = useCallback(async (file: ProjectFile, deleteRelated: boolean) => {
    try {
      // Note: deleteRelated parameter is kept for backward compatibility but is ignored
      await handleDelete(file.id, true);
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
      setImportWizardFile({
        id: file.id,
        name: file.name,
        size: file.size,
        type: fileType?.mimeType || 'application/octet-stream',
        companions: file.companions || []
      });
      setImportWizardStep(1); // Start at Parse & Analyze
      setShowImportWizard(true);
    }
  };

  const handleImportComplete = async (result: any) => {
    try {
      // Add detailed console logging
      logManager.info(LOG_SOURCE, '🎉 Import completed successfully!', {
        totalImported: result.totalImported,
        totalFailed: result.totalFailed,
        collectionId: result.collectionId,
        layerId: result.layerId,
        timestamp: new Date().toISOString()
      });
      
      // Close the dialog first
      setImportDialogOpen(false);
      setSelectedFile(undefined);
      
      // Add a small delay to ensure database updates have completed
      // This is important because the import process updates the database asynchronously
      setTimeout(async () => {
        try {
          logManager.debug(LOG_SOURCE, 'Refreshing file lists after import');
          // Refresh both lists to ensure we have the latest data
          await loadExistingFiles();
          
          // Refresh the imported files list directly using the ref
          if (importedFilesRef.current) {
            await importedFilesRef.current.refreshFiles();
            logManager.debug(LOG_SOURCE, 'Imported files list refreshed via ref');
          } else {
            // Fallback to key refresh if ref is not available
            setImportedFilesKey(prev => prev + 1);
            logManager.debug(LOG_SOURCE, 'Imported files list refreshed via key update');
          }
          
          logManager.debug(LOG_SOURCE, 'File lists refreshed successfully');
        } catch (refreshError) {
          logManager.error(LOG_SOURCE, 'Error refreshing file lists', refreshError);
        }
      }, 1000); // 1 second delay
      
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to complete import';
      logManager.error(LOG_SOURCE, '❌ Import completion error:', errorMessage);
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
    try {
      const extension = file.name.toLowerCase();
      const contentType = extension.endsWith('.geojson') 
        ? 'application/geo+json'
        : extension.endsWith('.qmd')
        ? 'application/xml'
        : file.type || 'application/octet-stream';

      logger.debug(SOURCE, 'Starting file upload', { 
        fileName: file.name,
        size: file.size,
        type: contentType,
        extension
      });
      
      // Check file size against user settings or default limit
      const maxFileSize = settings?.maxFileSize || 50 * 1024 * 1024; // Default to 50MB if not set
      if (file.size > maxFileSize) {
        const sizeMB = Math.round(file.size / (1024 * 1024));
        const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
        const error = new Error(`File size (${sizeMB}MB) exceeds the maximum allowed size (${maxSizeMB}MB)`);
        logger.error(SOURCE, 'File size validation failed', { 
          fileName: file.name,
          fileSize: file.size,
          maxSize: maxFileSize,
          error: error.message 
        });
        throw error;
      }
      
      // Get signed URL
      logger.debug(SOURCE, 'Requesting signed URL', { fileName: file.name });
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        const error = new Error('Authentication required');
        logger.error(SOURCE, 'No valid session', { 
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
        logger.error(SOURCE, 'Failed to parse response', {
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
        logger.error(SOURCE, 'Failed to get signed URL', {
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
        logger.error(SOURCE, 'Invalid signed URL response', { 
          data: responseData,
          error: error.message
        });
        throw error;
      }

      const { signedUrl } = responseData.data;
      logger.debug(SOURCE, 'Got signed URL, starting upload to storage', { fileName: file.name });
      
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
              logger.info(SOURCE, 'Upload progress', { 
                fileName: file.name,
                progress: Math.round(percentComplete)
              });
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            logger.info(SOURCE, 'Upload completed successfully', { fileName: file.name });
            resolve(undefined);
          } else {
            let errorMessage = `Upload failed with status ${xhr.status}: ${xhr.statusText}`;
            
            // Handle specific error cases
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.statusCode === '413' || response.error === 'Payload too large') {
                const sizeMB = Math.round(file.size / (1024 * 1024));
                errorMessage = `File size (${sizeMB}MB) exceeds the storage provider's limit. Please try a smaller file or contact support to upgrade your plan.`;
              }
            } catch (e) {
              // If we can't parse the response, use the default error message
            }
            
            const error = new Error(errorMessage);
            logger.error(SOURCE, 'Upload failed', {
              fileName: file.name,
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
          logger.error(SOURCE, 'Network error during upload', {
            fileName: file.name,
            status: xhr.status,
            statusText: xhr.statusText,
            response: xhr.responseText,
            error: error.message
          });
          reject(error);
        });

        xhr.addEventListener('abort', () => {
          const error = new Error('Upload aborted');
          logger.error(SOURCE, 'Upload aborted', {
            fileName: file.name,
            error: error.message
          });
          reject(error);
        });

        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(file);
      });
    } catch (error) {
      logger.error(SOURCE, 'Upload failed', {
        fileName: file.name,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : 'Unknown error'
      });
      throw error;
    }
  };

  const handleUpload = async (group: FileGroup) => {
    const mainFileName = group.mainFile.name;
    
    try {
      // Validate file size before uploading
      const maxFileSize = settings?.maxFileSize || 50 * 1024 * 1024; // Default to 50MB if not set
      const totalSize = group.mainFile.size + group.companions.reduce((sum: number, file: File) => sum + file.size, 0);
      
      if (totalSize > maxFileSize) {
        const sizeMB = Math.round(totalSize / (1024 * 1024));
        const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
        throw new Error(`Total file size (${sizeMB}MB) exceeds the maximum allowed size (${maxSizeMB}MB)`);
      }
      
      logger.info(SOURCE, 'Starting upload for group', {
        mainFile: mainFileName,
        companions: group.companions.map(f => f.name),
        totalSize,
        maxAllowedSize: maxFileSize
      });

      // Upload main file first
      logger.info(SOURCE, 'Uploading main file', { fileName: mainFileName });
      await uploadFile(group.mainFile, (progress) => {
        updateUploadProgress(mainFileName, progress);
      });
      
      // Upload companion files if any
      const relatedFiles: Record<string, { name: string; size: number }> = {};
      if (group.companions.length > 0) {
        for (const companion of group.companions) {
          const ext = FileTypeUtil.getExtension(companion.name);
          logger.info(SOURCE, 'Uploading companion file', {
            fileName: companion.name,
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
      logger.info(SOURCE, 'Creating database record', {
        mainFile: mainFileName,
        relatedFiles
      });
      await handleUploadComplete({
        id: '',
        name: mainFileName,
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
      
      logger.info(SOURCE, 'Upload process completed', { fileName: mainFileName });
    } catch (error) {
      logger.error(SOURCE, 'Upload process failed', {
        fileName: mainFileName,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : 'Unknown error'
      });
      
      // Show a more user-friendly error message
      let errorMessage = error instanceof Error ? error.message : 'Failed to upload files';
      
      // Check if it's a size limit error
      if (error instanceof Error && error.message.includes('exceeds')) {
        // Already formatted nicely
      } else if (error instanceof Error && error.message.includes('413')) {
        // Format the 413 Payload Too Large error
        const maxFileSize = settings?.maxFileSize || 50 * 1024 * 1024;
        const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
        errorMessage = `File upload failed: The file exceeds the maximum allowed size (${maxSizeMB}MB)`;
      }
      
      // Set the error for the dialog
      setUploadError({
        message: errorMessage,
        fileName: mainFileName,
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
    logger.info(SOURCE, 'View layer requested', { layerId });
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

  // Use main files as returned from the DB, which already have companions attached
  const groupedFiles = files.filter(f => !f.main_file_id);

  // Debug logging to verify file grouping
  useEffect(() => {
    // Only log when files change
    if (files && files.length > 0) {
      logManager.info(LOG_SOURCE, 'Raw files from DB', { files });
      logManager.debug(LOG_SOURCE, 'Grouped files for FileList', { groupedFiles });
    }
  }, [files, groupedFiles]);

  return (
    <div className="flex flex-col h-full">
      {/* Top CTA and description */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-2">
        <div>
          <h2 className="text-xl font-bold mb-1">Project Files</h2>
          <p className="text-muted-foreground text-sm">Upload new files and import them into your project using the guided wizard.</p>
        </div>
        <Button onClick={() => setShowImportWizard(true)} className="gap-2" size="lg">
          <Upload className="w-5 h-5" /> Upload & Import
        </Button>
      </div>

      {/* Main card */}
      <div className={cn('relative min-h-[200px] rounded-lg border bg-card', {
        'border-primary': isDragging
      })}>
        <div ref={dropZoneRef} className="p-4 space-y-6">
          {/* Uploaded Files Section (Collapsible) */}
          <div>
            <button
              className="flex items-center w-full text-left mb-3 group"
              onClick={() => setUploadedOpen((v) => !v)}
              type="button"
            >
              {uploadedOpen ? (
                <ChevronDown className="w-4 h-4 mr-2 transition-transform" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-2 transition-transform" />
              )}
              <span className="text-lg font-semibold">Uploaded Files</span>
            </button>
            {uploadedOpen && (
              <div>
                {uploadingFiles.length > 0 && (
                  <div className="mb-4">
                    <UploadProgress files={uploadingFiles} />
                  </div>
                )}
                {/* Debug log for groupedFiles structure */}
                {(() => { logManager.debug(LOG_SOURCE, 'RENDER groupedFiles for FileList', { groupedFiles }); return null; })()}
                <FileList
                  files={groupedFiles}
                  onDelete={handleFileDelete}
                  onImport={handleFileImport}
                  isLoading={isLoading}
                />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border my-2"></div>

          {/* Imported Files Section (Collapsible) */}
          <div className="bg-muted/30 p-4 rounded-lg border border-border">
            <button
              className="flex items-center w-full text-left mb-3 group"
              onClick={() => setImportedOpen((v) => !v)}
              type="button"
            >
              {importedOpen ? (
                <ChevronDown className="w-4 h-4 mr-2 transition-transform" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-2 transition-transform" />
              )}
              <span className="text-lg font-semibold">Imported Files</span>
            </button>
            {importedOpen && (
              <ImportedFilesList
                ref={importedFilesRef}
                key={importedFilesKey}
                projectId={projectId}
                onViewLayer={handleViewLayer}
                onDelete={handleFileDelete}
              />
            )}
          </div>
        </div>
      </div>

      {/* Import Wizard Modal */}
      <Dialog open={showImportWizard} onOpenChange={setShowImportWizard}>
        <DialogContent className="max-w-[72rem] w-full">
          <div className="p-4">
            <DialogHeader className="mb-10">
              <DialogTitle>Upload & Import Files</DialogTitle>
            </DialogHeader>
            <ImportWizard projectId={projectId} initialFileInfo={importWizardFile} initialStep={importWizardStep} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <UploadErrorDialog
        isOpen={!!uploadError}
        onClose={() => setUploadError(null)}
        error={uploadError?.message || ''}
        fileName={uploadError?.fileName}
        fileSize={uploadError?.fileSize}
      />
    </div>
  );
}

// ... rest of the code ...
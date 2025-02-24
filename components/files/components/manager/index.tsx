import React from 'react';
import { FileList } from './file-list';
import { EmptyState } from './empty-state';
import { Toolbar } from './toolbar';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileActions } from '../../hooks/useFileActions';
import { FileGroup, ProcessedFiles, ProjectFile } from '../../types';
import { Button } from '@/components/ui/button';
import { UploadProgress } from './upload-progress';
import { GeoImportDialog } from '@/components/geo-import/components/geo-import-dialog';
import { FileTypeUtil } from '../../utils/file-types';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { ImportedFilesList } from '../imported-files-list';

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
  const [isDragging, setIsDragging] = React.useState(false);
  const dropZoneRef = React.useRef<HTMLDivElement>(null);
  const dragCountRef = React.useRef(0);

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
        console.error(`[FileManager] ${logContext} No valid session`, { error: sessionError });
        throw new Error('Authentication required');
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[FileManager] ${logContext} Failed to get signed URL`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Failed to get signed URL: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.data?.signedUrl) {
        console.error(`[FileManager] ${logContext} Invalid signed URL response`, { data });
        throw new Error('Invalid signed URL response from server: ' + JSON.stringify(data));
      }

      const { signedUrl } = data.data;
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
            const error = new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText} - ${xhr.responseText}`);
            console.error(`[FileManager] ${logContext} Upload failed`, {
              status: xhr.status,
              statusText: xhr.statusText,
              response: xhr.responseText
            });
            reject(error);
          }
        });

        xhr.addEventListener('error', () => {
          const error = new Error(`Upload failed: Network error - ${xhr.statusText}`);
          console.error(`[FileManager] ${logContext} Network error during upload`, {
            status: xhr.status,
            statusText: xhr.statusText,
            response: xhr.responseText
          });
          reject(error);
        });

        xhr.addEventListener('abort', () => {
          const error = new Error('Upload aborted');
          console.error(`[FileManager] ${logContext} Upload aborted`);
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
        companions: group.companions.map(c => ({
          name: c.name,
          type: c.type,
          size: c.size
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
          group.companions.map(companion => [
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
        error: errorMessage,
        stack: e instanceof Error ? e.stack : undefined
      });
      onError?.(errorMessage);
      
      setUploadingFiles(prev => prev.filter(uf => uf.group.mainFile.name !== mainFileName));
      await loadExistingFiles();
    }
  };

  const handleDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCountRef.current++;
    
    if (!isProcessing) {
      setIsDragging(true);
    }
  }, [isProcessing]);

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCountRef.current--;
    
    // Only hide the drop zone when all drag events are complete
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCountRef.current = 0;
    setIsDragging(false);

    if (isProcessing) {
      console.info('[FileManager] Skipping drop - already processing');
      return;
    }

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      console.info('[FileManager] Files dropped', {
        count: droppedFiles.length,
        names: Array.from(droppedFiles).map(f => f.name)
      });
      handleFileSelect(droppedFiles);
    }
  }, [isProcessing, handleFileSelect]);

  const handleViewLayer = (layerId: string) => {
    // TODO: Implement layer viewing functionality
    console.info('View layer requested', { layerId });
  };

  const handleDeleteImported = async (fileId: string) => {
    try {
      await handleDelete(fileId);
      await loadExistingFiles();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to delete imported file';
      onError?.(errorMessage);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 p-4 border rounded-lg bg-background">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              <div
                className={cn(
                  "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg",
                  "hover:border-primary/50 transition-colors duration-200",
                  "cursor-pointer bg-muted/50"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={handleFileSelect}
              >
                <Upload className="w-8 h-8 mb-4 text-muted-foreground" />
                <div className="text-sm text-center text-muted-foreground">
                  <p>Drag and drop files here or click to select files</p>
                  <p className="mt-2">Supported formats: Shapefile (.shp), GeoJSON (.geojson)</p>
                </div>
              </div>
              <div className="relative">
                <Toolbar 
                  onFileSelect={handleFileSelect} 
                  isProcessing={isProcessing}
                />
                {error && (
                  <div className="text-red-500 text-sm mt-2">{error}</div>
                )}
              </div>
            </div>
          </div>
          
          {/* Uploading Files Section */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-4">
              <div className="font-medium text-gray-700">Uploading Files</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {uploadingFiles.map((uploadingFile) => (
                  <div key={uploadingFile.group.mainFile.name}>
                    <FileList
                      mainFile={uploadingFile.group.mainFile}
                      companions={uploadingFile.group.companions}
                    />
                    <div className="mt-2">
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
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-700">Uploaded Files</div>
                  <div className="text-sm text-gray-500">Select Import to use these files in your project</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {files.filter(file => !file.main_file_id).map((mainFile) => (
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
      </div>

      {/* Imported Files Section */}
      <ImportedFilesList
        projectId={projectId}
        onViewLayer={handleViewLayer}
        onDelete={handleDeleteImported}
      />

      {/* Import Dialog */}
      {selectedFile && (
        <GeoImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          projectId={projectId}
          fileInfo={selectedFile}
          onImportComplete={handleImportComplete}
        />
      )}
    </div>
  );
} 
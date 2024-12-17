import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from 'components/ui/card';
import { useToast } from 'components/ui/use-toast';
import { FileManagerProps, ProjectFile, ViewMode, FileUploadResult } from './types';
import { FileActions } from './actions';
import { FileToolbar } from './toolbar';
import { FileList } from './file-list';
import { EmptyState } from './empty-state';

export function FileManager({ projectId, onGeoImport }: FileManagerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Initialize FileActions
  const fileActions = new FileActions({
    projectId,
    onRefresh: () => loadFiles(),
    onError: (message) => toast({
      title: 'Error',
      description: message,
      variant: 'destructive',
    }),
    onSuccess: (message) => toast({
      title: 'Success',
      description: message,
    }),
  });

  useEffect(() => {
    loadFiles();
  }, [projectId]);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const allFiles = await fileActions.loadFiles();

      // Group imported files with their source files
      const fileMap = new Map<string, ProjectFile & { importedFiles?: ProjectFile[] }>();
      
      allFiles.forEach(file => {
        if (file.source_file_id) {
          // This is an imported file
          const sourceFile = fileMap.get(file.source_file_id);
          if (sourceFile) {
            sourceFile.importedFiles = sourceFile.importedFiles || [];
            sourceFile.importedFiles.push(file);
          }
        } else {
          // This is a source file
          if (!fileMap.has(file.id)) {
            fileMap.set(file.id, { ...file, importedFiles: [] });
          }
        }
      });

      setFiles(Array.from(fileMap.values()));
    } catch (error) {
      // Error is handled by FileActions
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadComplete = async (uploadedFile: FileUploadResult) => {
    try {
      const newFile = await fileActions.handleUploadComplete(uploadedFile);
      setFiles(prevFiles => [
        { ...newFile, importedFiles: [] },
        ...prevFiles
      ]);
    } catch (error) {
      // Error is handled by FileActions
    }
  };

  const handleImport = async (result: any, sourceFile: ProjectFile) => {
    try {
      const importedFile = await fileActions.handleImport(result, sourceFile);
      
      // Update local state
      setFiles(prevFiles => {
        return prevFiles.map(file => {
          if (file.id === sourceFile.id) {
            return {
              ...file,
              importedFiles: [...(file.importedFiles || []), importedFile]
            };
          }
          return file;
        });
      });

      if (onGeoImport) {
        onGeoImport(result, importedFile);
      }
    } catch (error) {
      // Error is handled by FileActions
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      await fileActions.handleDelete(fileId);
      setFiles(prevFiles => prevFiles.filter(f => f.id !== fileId));
    } catch (error) {
      // Error is handled by FileActions
    }
  };

  return (
    <Card>
      <CardHeader>
        <FileToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          projectId={projectId}
          onUploadComplete={handleUploadComplete}
        />
      </CardHeader>
      <CardContent>
        {isLoading || files.length === 0 ? (
          <EmptyState isLoading={isLoading} />
        ) : (
          <FileList
            files={files}
            viewMode={viewMode}
            onDelete={handleDelete}
            onImport={handleImport}
          />
        )}
      </CardContent>
    </Card>
  );
}

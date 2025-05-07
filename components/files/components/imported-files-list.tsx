'use client';

import { useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { dbLogger } from '@/utils/logging/dbLogger';
import { ProjectFile } from '@/components/files/types';
import { FileIcon } from '@/components/files/components/item/file-icon';
import { Badge } from '@/components/ui/badge';
import { DeleteConfirmationDialog } from './delete-confirmation-dialog';

interface ImportedFilesListProps {
  projectId: string;
  onViewLayer?: (layerId: string) => void;
  onDelete?: (file: ProjectFile, deleteRelated: boolean) => Promise<void>;
}

interface ImportedFile {
  id: string;
  name: string;
  source_file_id: string | null;
  is_imported: boolean;
  uploaded_at: string;
  import_metadata: {
    collection_id: string;
    layer_id: string;
    imported_count: number;
    failed_count: number;
    imported_at: string;
  };
}

const SOURCE = 'ImportedFilesList';

export interface ImportedFilesListRef {
  refreshFiles: () => Promise<void>;
}

export const ImportedFilesList = forwardRef<ImportedFilesListRef, ImportedFilesListProps>(
  function ImportedFilesList({ projectId, onViewLayer, onDelete }, ref) {
    const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fileToDelete, setFileToDelete] = useState<ImportedFile | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const loadImportedFiles = async () => {
      try {
        setIsLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
          .from('project_files')
          .select(`
            id,
            name,
            import_metadata,
            source_file_id,
            is_imported,
            uploaded_at
          `)
          .eq('project_id', projectId)
          .eq('is_imported', true)
          .order('uploaded_at', { ascending: false });

        if (error) throw error;

        await dbLogger.info('importedFilesList.loaded', {
          projectId,
          count: data?.length,
          files: data?.map((f: ImportedFile) => ({ id: f.id, name: f.name }))
        }, { SOURCE });

        setImportedFiles(data || []);
      } catch (error: unknown) {
        await dbLogger.error('importedFilesList.loadError', {
          projectId,
          error: error instanceof Error ? error.message : error
        }, { SOURCE });
      } finally {
        setIsLoading(false);
      }
    };

    // Expose the refreshFiles method via ref
    useImperativeHandle(ref, () => ({
      refreshFiles: async () => {
        await loadImportedFiles();
      }
    }));

    useEffect(() => {
      loadImportedFiles();
    }, [projectId]);

    const handleDeleteClick = (file: ImportedFile) => {
      setFileToDelete(file);
      setShowDeleteDialog(true);
    };

    const handleDeleteConfirm = async () => {
      if (fileToDelete && onDelete) {
        await onDelete(fileToDelete as unknown as ProjectFile, true);
        setShowDeleteDialog(false);
        setFileToDelete(null);
      }
    };

    if (isLoading) {
      return (
        <div className="text-sm text-muted-foreground">
          Loading imported files...
        </div>
      );
    }

    if (importedFiles.length === 0) {
      return (
        <div className="text-sm text-muted-foreground">
          No imported files yet
        </div>
      );
    }

    return (
      <>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {importedFiles.map((file) => (
              <Card key={file.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <FileIcon fileName={file.name} isMain={true} />
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-medium truncate">
                        {file.name}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {file.import_metadata.imported_count} features imported
                        {file.import_metadata.failed_count > 0 && 
                          ` (${file.import_metadata.failed_count} failed)`}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <p className="text-xs text-muted-foreground">
                    {file.import_metadata?.imported_at ? 
                      `Imported ${formatDistanceToNow(new Date(file.import_metadata.imported_at))} ago` : 
                      'Recently imported'
                    }
                  </p>
                </CardContent>
                <CardFooter className="flex justify-between mt-auto pt-4">
                  <div className="flex items-center gap-2">
                    {onViewLayer && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewLayer(file.import_metadata.layer_id)}
                        className="h-8"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(file)}
                        className="h-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>

        <DeleteConfirmationDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDeleteConfirm}
          fileName={fileToDelete?.name || ''}
          type="imported"
          hasRelatedFile={!!fileToDelete?.source_file_id}
        />
      </>
    );
  }
); 
'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { LogManager } from '@/core/logging/log-manager';
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
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  }
};

export function ImportedFilesList({ projectId, onViewLayer, onDelete }: ImportedFilesListProps) {
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fileToDelete, setFileToDelete] = useState<ImportedFile | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    async function loadImportedFiles() {
      try {
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

        logger.info('Loaded imported files', {
          count: data?.length,
          files: data?.map((f: ImportedFile) => ({ id: f.id, name: f.name }))
        });

        setImportedFiles(data || []);
      } catch (error) {
        logger.error('Failed to load imported files', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadImportedFiles();
  }, [projectId]);

  const handleDeleteClick = (file: ImportedFile) => {
    setFileToDelete(file);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async (deleteRelated: boolean) => {
    if (fileToDelete && onDelete) {
      await onDelete(fileToDelete as unknown as ProjectFile, deleteRelated);
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
        <h3 className="text-base font-medium">Imported Files</h3>
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
                  Imported {formatDistanceToNow(new Date(file.import_metadata.imported_at))} ago
                </p>
              </CardContent>
              <CardFooter className="flex justify-between mt-auto pt-4">
                <Badge variant="secondary" className="text-xs">
                  Imported
                </Badge>
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
        hasRelatedFile={true}
      />
    </>
  );
} 
'use client';

import { useEffect, useState, useImperativeHandle, forwardRef, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { dbLogger } from '@/utils/logging/dbLogger';
import { ProjectFile } from '@/components/files/types';
import { FileIcon } from '@/components/files/components/item/file-icon';
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
  size?: number;
  file_type?: string;
}

type SupabaseProjectFileRow = {
  id: string;
  name: string;
  source_file_id: string | null;
  is_imported: boolean | null;
  uploaded_at: string;
  import_metadata: {
    collection_id: string;
    layer_id: string;
    imported_count: number;
    failed_count: number;
    imported_at: string;
  };
  size?: number;
  file_type?: string;
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
    const subscriptionRef = useRef<any>(null);
    // Expandable state for each file
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const loadImportedFiles = useCallback(async () => {
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
            uploaded_at,
            size,
            file_type
          `)
          .eq('project_id', projectId)
          .eq('is_imported', true)
          .order('uploaded_at', { ascending: false });

        if (error) throw error;

        await dbLogger.info('importedFilesList.loaded', {
          projectId,
          count: data?.length,
          files: (data || []).map((f: SupabaseProjectFileRow) => ({ id: f.id, name: f.name })),
        }, { SOURCE });

        setImportedFiles((data || []).map((f: SupabaseProjectFileRow) => ({
          ...f,
          is_imported: !!f.is_imported,
        })));
      } catch (error: unknown) {
        await dbLogger.error('importedFilesList.loadError', {
          projectId,
          error: error instanceof Error ? error.message : error
        }, { SOURCE });
      } finally {
        setIsLoading(false);
      }
    }, [projectId]);

    // Expose the refreshFiles method via ref
    useImperativeHandle(ref, () => ({
      refreshFiles: async () => {
        await loadImportedFiles();
      }
    }));

    useEffect(() => {
      const supabase = createClient();
      // Clean up previous subscription if any
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      // Subscribe to real-time changes for all files in this project
      const channel = supabase.channel(`imported_files_changes_${projectId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'project_files',
            filter: `project_id=eq.${projectId}`,
          },
          async (payload) => {
            // Add a delay to avoid race condition
            setTimeout(() => {
              loadImportedFiles();
            }, 300);
          }
        )
        .subscribe();
      subscriptionRef.current = channel;
      return () => {
        if (subscriptionRef.current) {
          supabase.removeChannel(subscriptionRef.current);
          subscriptionRef.current = null;
        }
      };
    }, [projectId, loadImportedFiles]);

    useEffect(() => {
      (async () => {
        await loadImportedFiles();
      })().catch(() => {});
    }, [projectId, loadImportedFiles]);

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

    // Expandable state for each file
    const toggleExpand = (fileId: string) => {
      setExpanded((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
    };

    // Helper to get file type or extension
    function getFileTypeDisplay(file: ImportedFile): string {
      if (file.file_type && file.file_type !== 'EMPTY') return file.file_type;
      if (file.name) {
        const ext = file.name.split('.').pop();
        if (!ext) return 'Unknown';
        // Friendly mapping for common geodata
        if (ext.toLowerCase() === 'shp') return 'Shapefile (.shp)';
        if (ext.toLowerCase() === 'dbf') return 'dBASE Table (.dbf)';
        if (ext.toLowerCase() === 'shx') return 'Shape Index (.shx)';
        if (ext.toLowerCase() === 'prj') return 'Projection (.prj)';
        return `.${ext}`;
      }
      return 'Unknown';
    }

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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(file.id)}
                      className="h-8"
                      aria-label={expanded[file.id] ? 'Collapse details' : 'Expand details'}
                    >
                      {expanded[file.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <p className="text-xs text-muted-foreground">
                    {file.import_metadata?.imported_at ? 
                      `Imported ${formatDistanceToNow(new Date(file.import_metadata.imported_at))} ago` : 
                      'Recently imported'
                    }
                  </p>
                  {expanded[file.id] && (
                    <div className="mt-2 text-xs space-y-1">
                      <div><strong>File size:</strong> {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'N/A'}</div>
                      <div><strong>File type:</strong> {getFileTypeDisplay(file)}</div>
                      <div><strong>Upload date:</strong> {file.uploaded_at ? new Date(file.uploaded_at).toLocaleString() : 'N/A'}</div>
                    </div>
                  )}
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
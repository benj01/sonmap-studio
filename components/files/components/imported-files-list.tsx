'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Download, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabaseBrowserClient as supabase } from '@/utils/supabase/browser-client';
import { LogManager } from '@/core/logging/log-manager';

interface ImportedFile {
  id: string;
  name: string;
  import_metadata: {
    collection_id: string;
    layer_id: string;
    imported_count: number;
    failed_count: number;
    imported_at: string;
  };
}

interface ImportedFilesListProps {
  projectId: string;
  onViewLayer?: (layerId: string) => void;
  onDelete?: (fileId: string) => void;
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

  useEffect(() => {
    async function loadImportedFiles() {
      try {
        const { data, error } = await supabase
          .from('project_files')
          .select('id, name, import_metadata')
          .eq('project_id', projectId)
          .eq('is_imported', true)
          .order('name');

        if (error) throw error;

        setImportedFiles(data || []);
      } catch (error) {
        logger.error('Failed to load imported files', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadImportedFiles();
  }, [projectId]);

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
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Imported Files</h3>
      <div className="grid gap-4">
        {importedFiles.map((file) => (
          <Card key={file.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {file.import_metadata.imported_count} features imported
                  {file.import_metadata.failed_count > 0 && 
                    ` (${file.import_metadata.failed_count} failed)`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Imported {formatDistanceToNow(new Date(file.import_metadata.imported_at))} ago
                </p>
              </div>
              <div className="flex gap-2">
                {onViewLayer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewLayer(file.import_metadata.layer_id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(file.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
} 
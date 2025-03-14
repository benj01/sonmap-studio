import React, { useState } from 'react';
import { FileIcon } from '../item/file-icon';
import { ChevronDown, ChevronRight, Import, Trash2 } from 'lucide-react';
import { ProjectFile } from '../../types';
import { Button } from '../../../ui/button';
import { cn } from '../../../../lib/utils';
import { Badge } from '../../../ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from '../../../ui/card';
import { DeleteConfirmationDialog } from '../delete-confirmation-dialog';

interface FileListProps {
  files: ProjectFile[];
  onDelete: (file: ProjectFile, deleteRelated: boolean) => Promise<void>;
  onImport: (fileId: string) => Promise<void>;
  isLoading: boolean;
}

export function FileList({ files = [], onDelete, onImport, isLoading }: FileListProps) {
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [fileToDelete, setFileToDelete] = useState<ProjectFile | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const toggleExpand = (fileId: string) => {
    setExpandedFiles(prev => ({
      ...prev,
      [fileId]: !prev[fileId]
    }));
  };

  const handleDeleteClick = (file: ProjectFile) => {
    setFileToDelete(file);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async (deleteRelated: boolean) => {
    if (fileToDelete) {
      await onDelete(fileToDelete, deleteRelated);
      setShowDeleteDialog(false);
      setFileToDelete(null);
    }
  };

  if (!files?.length) {
    return (
      <div className="text-sm text-muted-foreground">
        No files uploaded yet. Click "Select Files" to upload.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {files.map((file) => (
          <Card key={file.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2">
                  {file.companions?.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 hover:bg-transparent"
                      onClick={() => toggleExpand(file.id)}
                    >
                      {expandedFiles[file.id] ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <FileIcon fileName={file.name} isMain={true} />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base font-medium truncate">
                    {file.name}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {formatSize(file.size)}
                    {file.companions?.length > 0 && (
                      <span className="ml-2">
                        ({file.companions.length} related {file.companions.length === 1 ? 'file' : 'files'})
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            {file.companions?.length > 0 && expandedFiles[file.id] && (
              <CardContent className="pb-2">
                <div className="pl-8 space-y-2 border-l">
                  {file.companions.map((companion) => (
                    <div key={companion.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                      <FileIcon fileName={companion.name} isMain={false} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{companion.name}</div>
                        <div className="text-xs text-muted-foreground">{formatSize(companion.size)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}

            <CardFooter className="flex justify-between mt-auto pt-4">
              <div className="flex items-center">
                {file.is_imported && (
                  <Badge variant="secondary" className="text-xs">
                    Imported
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!file.is_imported && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onImport(file.id)}
                    disabled={isLoading}
                    className="h-8"
                  >
                    <Import className="h-4 w-4 mr-1" />
                    Import
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(file)}
                  disabled={isLoading}
                  className="h-8"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>

      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteConfirm}
        fileName={fileToDelete?.name || ''}
        type="uploaded"
        hasRelatedFile={fileToDelete?.is_imported || false}
      />
    </>
  );
} 
import React, { useState, useEffect } from 'react';
import { FileIcon } from '../item/file-icon';
import { ChevronDown, ChevronRight, Import, Trash2, Info } from 'lucide-react';
import { ProjectFile } from '../../types';
import { Button } from '../../../ui/button';
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

  // By default, all groups are collapsed
  useEffect(() => {
    setExpandedFiles({});
    // Only run on mount or files change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.map(f => f.id).join(",")]);

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

  const handleDeleteConfirm = async () => {
    if (fileToDelete) {
      // Always pass true for deleteRelated since the database will delete related files anyway
      await onDelete(fileToDelete, true);
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
                  {(file.companions?.length ?? 0) > 0 && (
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
                    {file.companions && (file.companions?.length ?? 0) > 0 && (
                      <span className="ml-2">
                        ({file.companions?.length} related {file.companions?.length === 1 ? 'file' : 'files'})
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            {file.companions && (file.companions?.length ?? 0) > 0 && expandedFiles[file.id] && (
              <CardContent className="pb-2">
                <div
                  className="pl-8 space-y-2 border-l-2 border-blue-200 bg-blue-50/50 rounded-md relative"
                  aria-label="Related companion files"
                >
                  <div className="flex items-center gap-2 mb-1 text-xs text-blue-700">
                    <span className="relative group" aria-label="Companion files info">
                      <Info className="h-4 w-4" aria-hidden="true" />
                      <span className="absolute left-6 top-0 z-10 hidden group-hover:block bg-white border border-gray-300 text-xs text-gray-800 rounded px-2 py-1 shadow-md w-64">
                        Companion files are required for certain geodata formats (e.g., Shapefile). They are automatically detected and grouped.
                      </span>
                    </span>
                    <span>Companion files for this dataset</span>
                  </div>
                  {file.companions?.map((companion) => (
                    <div key={companion.id} className="flex items-center gap-1 p-1 rounded-md hover:bg-blue-100">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{companion.name}</div>
                        <div className="text-[10px] text-muted-foreground">{formatSize(companion.size)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}

            <CardFooter className="flex justify-between mt-auto pt-4">
              <div className="flex items-center">
                {file.is_imported && (
                  <Badge className="text-xs bg-green-600 text-white border-green-700">
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
import { useState } from 'react'
import { Card } from 'components/ui/card'
import { Button } from 'components/ui/button'
import { FileIcon, Loader2, Trash2, Import, FileJson, ChevronDown, ChevronRight } from 'lucide-react'
import { formatFileSize } from 'lib/utils'
import { GeoImportDialog } from 'components/geo-loader'
import { LoaderResult, ImportMetadata } from 'types/geo'
import { Database } from 'types/supabase'
import { createClient } from 'utils/supabase/client'

type ProjectFile = Database['public']['Tables']['project_files']['Row'] & {
  relatedFiles?: { [key: string]: string };
  importedFiles?: ProjectFile[];
};

interface FileItemProps {
  file: ProjectFile
  viewMode: 'grid' | 'list'
  onDelete: (id: string) => Promise<void>
  onImport: (result: LoaderResult) => void
}

export function FileItem({ file, viewMode, onDelete, onImport }: FileItemProps) {
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const supabase = createClient()

  const isGeoFile = file.name.toLowerCase().match(/\.(dxf|shp|csv|xyz)$/);
  const isImportedFile = file.source_file_id !== null;
  const hasImportedFiles = file.importedFiles && file.importedFiles.length > 0;
  const importMetadata = file.import_metadata as ImportMetadata | null;

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(file.id)
    } finally {
      setIsDeleting(false)
    }
  }

  const renderImportMetadata = () => {
    if (!importMetadata) return null;

    return (
      <div className="text-sm text-muted-foreground mt-2">
        <p>Imported from: {importMetadata.sourceFile.name}</p>
        <p>Features: {importMetadata.statistics.totalFeatures}</p>
        <p>Layers: {importMetadata.importedLayers.length}</p>
        {importMetadata.statistics.failedTransformations && (
          <p className="text-yellow-600">
            Failed transformations: {importMetadata.statistics.failedTransformations}
          </p>
        )}
      </div>
    );
  };

  const renderImportedFiles = () => {
    if (!hasImportedFiles) return null;

    return (
      <div className="ml-6 mt-2 space-y-2">
        {file.importedFiles?.map(importedFile => (
          <Card key={importedFile.id} className="p-2">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">{importedFile.name}</span>
              <span className="text-xs text-muted-foreground">
                ({formatFileSize(importedFile.size)})
              </span>
            </div>
            {renderImportMetadata()}
          </Card>
        ))}
      </div>
    );
  };

  if (viewMode === 'grid') {
    return (
      <Card className="p-4">
        <div className="flex flex-col items-center text-center">
          <FileIcon className="h-8 w-8 mb-2" />
          <div className="space-y-1">
            <p className="font-medium text-sm truncate w-full" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            {isGeoFile && !isImportedFile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportDialogOpen(true)}
              >
                <Import className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
          {hasImportedFiles && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {file.importedFiles?.length} imported version{file.importedFiles?.length === 1 ? '' : 's'}
            </Button>
          )}
          {isExpanded && renderImportedFiles()}
        </div>
        {isImportDialogOpen && (
          <GeoImportDialog
            isOpen={isImportDialogOpen}
            onClose={() => setIsImportDialogOpen(false)}
            file={new File([], file.name)} // TODO: Load actual file from storage
            onImportComplete={onImport}
          />
        )}
      </Card>
    )
  }

  return (
    <div className="flex items-center justify-between p-2 hover:bg-accent rounded-lg">
      <div className="flex items-center gap-2">
        <FileIcon className="h-4 w-4" />
        <div>
          <p className="font-medium text-sm">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isGeoFile && !isImportedFile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsImportDialogOpen(true)}
          >
            <Import className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
      {isImportDialogOpen && (
        <GeoImportDialog
          isOpen={isImportDialogOpen}
          onClose={() => setIsImportDialogOpen(false)}
          file={new File([], file.name)} // TODO: Load actual file from storage
          onImportComplete={onImport}
        />
      )}
    </div>
  )
}

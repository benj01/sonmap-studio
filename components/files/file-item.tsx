import { formatBytes } from 'lib/utils'
import { GeoImportDialog } from 'components/geo-loader'
import { Database } from 'types/supabase'
import { LoaderResult } from 'types/geo'
import { Button } from 'components/ui/button'
import { Download, Share2, Trash2, FileIcon, FileSpreadsheet, FileJson, Import } from 'lucide-react'
import { createClient } from 'utils/supabase/client'
import { useState } from 'react'
import { cn } from 'utils/cn'
import { Dialog, DialogTrigger } from 'components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "components/ui/tooltip"

type ProjectFile = Database['public']['Tables']['project_files']['Row'] & {
  importedFiles?: ProjectFile[]
}

interface FileItemProps {
  file: ProjectFile
  viewMode: 'grid' | 'list'
  onDelete: (fileId: string) => Promise<void>
  onImport: (result: LoaderResult) => Promise<void>
}

export function FileItem({ file, viewMode, onDelete, onImport }: FileItemProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [fileForImport, setFileForImport] = useState<File | null>(null)
  const supabase = createClient()

  const getFileIcon = () => {
    switch (file.file_type) {
      case 'application/dxf':
        return FileIcon
      case 'application/geo+json':
        return FileJson
      case 'text/csv':
        return FileSpreadsheet
      default:
        return FileIcon
    }
  }

  const Icon = getFileIcon()

  const handleDownload = async () => {
    try {
      setIsDownloading(true)
      const { data, error } = await supabase.storage
        .from('project-files')
        .download(file.storage_path.replace(/^projects\//, ''))

      if (error) throw error

      // Create a download link
      const url = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download error:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleShare = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('project-files')
        .createSignedUrl(file.storage_path.replace(/^projects\//, ''), 3600)

      if (error) throw error

      await navigator.clipboard.writeText(data.signedUrl)
    } catch (error) {
      console.error('Share error:', error)
    }
  }

  const handleImportClick = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('project-files')
        .download(file.storage_path.replace(/^projects\//, ''))

      if (error) throw error

      // Convert the downloaded blob to a File object
      const fileObj = new File([data], file.name, { type: file.file_type })
      setFileForImport(fileObj)
      setIsImportDialogOpen(true)
    } catch (error) {
      console.error('Import preparation error:', error)
    }
  }

  const isGeoFile = ['application/dxf', 'text/csv', 'application/x-shapefile'].includes(file.file_type)

  const containerClasses = cn(
    'relative group border rounded-lg p-4 hover:border-primary transition-colors',
    viewMode === 'list' ? 'flex items-center justify-between' : 'flex flex-col space-y-4'
  )

  return (
    <TooltipProvider>
      <div className={containerClasses}>
        <div className={cn(
          'flex items-center gap-3',
          viewMode === 'list' ? 'flex-1' : 'w-full'
        )}>
          <div className="flex-shrink-0">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size)}
            </p>
          </div>
        </div>

        <div className={cn(
          'flex items-center gap-2',
          viewMode === 'list' ? 'flex-shrink-0' : 'w-full justify-end'
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download file</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share file (copies link)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(file.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete file</p>
            </TooltipContent>
          </Tooltip>

          {isGeoFile && !file.is_imported && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleImportClick}
                >
                  <Import className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Import geo data</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {file.importedFiles && file.importedFiles.length > 0 && (
          <div className="mt-2 pl-4 border-l">
            {file.importedFiles.map(importedFile => (
              <div key={importedFile.id} className="flex items-center gap-2 py-1">
                <FileJson className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs">{importedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({formatBytes(importedFile.size)})
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Import Dialog */}
        {fileForImport && (
          <GeoImportDialog
            isOpen={isImportDialogOpen}
            onClose={() => {
              setIsImportDialogOpen(false)
              setFileForImport(null)
            }}
            file={fileForImport}
            onImportComplete={onImport}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

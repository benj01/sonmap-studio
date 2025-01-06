import { formatBytes } from 'lib/utils'
import { GeoImportDialog } from 'components/geo-loader'
import { LoaderResult } from 'types/geo'
import { Button } from 'components/ui/button'
import { Download, Share2, Trash2, FileIcon, FileSpreadsheet, FileJson, Import } from 'lucide-react'
import { createClient } from 'utils/supabase/client'
import { useState } from 'react'
import { cn } from 'utils/cn'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "components/ui/tooltip"
import { ProjectFile } from './types'

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
      case 'application/x-shapefile':
        // Use FileJson for shapefile sets to distinguish them
        return file.companion_files && file.companion_files.length > 0
          ? FileJson
          : FileIcon
      default:
        return FileIcon
    }
  }

  const Icon = getFileIcon()

  const handleDownload = async () => {
    try {
      setIsDownloading(true)

      // For shapefiles, download all files and create a zip
      if (file.file_type === 'application/x-shapefile' && file.companion_files) {
        const JSZip = (await import('jszip')).default
        const zip = new JSZip()

        // Download main file
        const { data: mainData, error: mainError } = await supabase.storage
          .from('project-files')
          .download(file.storage_path.replace(/^projects\//, ''))
        
        if (mainError) throw mainError
        zip.file(file.name, mainData)

        // Download companion files
        for (const companion of file.companion_files) {
          const { data: companionData, error: companionError } = await supabase.storage
            .from('project-files')
            .download(companion.storage_path.replace(/^projects\//, ''))
          
          if (companionError) {
            console.error(`Error downloading companion file ${companion.name}:`, companionError)
            continue
          }
          
          zip.file(companion.name, companionData)
        }

        // Generate zip file
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        const url = window.URL.createObjectURL(zipBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name.replace('.shp', '.zip')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } else {
        // For non-shapefiles, download single file
        const { data, error } = await supabase.storage
          .from('project-files')
          .download(file.storage_path.replace(/^projects\//, ''))

        if (error) throw error

        const url = window.URL.createObjectURL(data)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Download error:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleShare = async () => {
    try {
      if (file.file_type === 'application/x-shapefile' && file.companion_files) {
        // For shapefiles, create signed URLs for all files
        const urls = await Promise.all([
          supabase.storage
            .from('project-files')
            .createSignedUrl(file.storage_path.replace(/^projects\//, ''), 3600),
          ...file.companion_files.map(companion =>
            supabase.storage
              .from('project-files')
              .createSignedUrl(companion.storage_path.replace(/^projects\//, ''), 3600)
          )
        ])

        // Filter out any failed URLs and extract the signedUrl from successful ones
        const validUrls = urls
          .filter(result => !result.error && result.data?.signedUrl)
          .map(result => result.data!.signedUrl)

        // Create a formatted message with all URLs
        const message = [
          `Shapefile Set: ${file.name}`,
          '',
          'Download Links (valid for 1 hour):',
          ...validUrls.map(url => url)
        ].join('\n')

        await navigator.clipboard.writeText(message)
      } else {
        // For non-shapefiles, share single file URL
        const { data, error } = await supabase.storage
          .from('project-files')
          .createSignedUrl(file.storage_path.replace(/^projects\//, ''), 3600)

        if (error) throw error
        await navigator.clipboard.writeText(data.signedUrl)
      }
    } catch (error) {
      console.error('Share error:', error)
    }
  }

  const handleImportClick = async () => {
    try {
      // Download main file
      const { data: mainData, error: mainError } = await supabase.storage
        .from('project-files')
        .download(file.storage_path.replace(/^projects\//, ''))

      if (mainError) throw mainError

      // Convert the downloaded blob to a File object
      const mainFile = new File([mainData], file.name, { type: file.file_type })

      // Download companion files if this is a shapefile
      if (file.file_type === 'application/x-shapefile' && file.companion_files) {
        const companionFiles: { [key: string]: File } = {};
        
        for (const companion of file.companion_files) {
          const { data: companionData, error: companionError } = await supabase.storage
            .from('project-files')
            .download(companion.storage_path.replace(/^projects\//, ''))

          if (companionError) {
            console.error(`Error downloading companion file ${companion.name}:`, companionError)
            continue
          }

          companionFiles[companion.component_type] = new File(
            [companionData],
            companion.name,
            { type: 'application/octet-stream' }
          )
        }

        // Add companion files to the main file object for the processor to use
        Object.defineProperty(mainFile, 'relatedFiles', {
          value: companionFiles,
          enumerable: true
        })
      }

      setFileForImport(mainFile)
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

  const isShapefileSet = file.file_type === 'application/x-shapefile' && file.companion_files && file.companion_files.length > 0;
  
  return (
    <TooltipProvider>
      <div className={cn(
        containerClasses,
        isShapefileSet && 'border-primary bg-muted/30'
      )}>
        {/* Shapefile Set Header */}
        {isShapefileSet && (
          <div className="flex items-center gap-2 pb-2 mb-2 border-b">
            <Icon className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-medium">Shapefile Set</h3>
            <span className="text-xs text-muted-foreground">
              ({formatBytes(file.size + (file.companion_files?.reduce((sum, f) => sum + f.size, 0) || 0))})
            </span>
          </div>
        )}

        {/* Main File */}
        <div className={cn(
          'flex items-center gap-3',
          viewMode === 'list' ? 'flex-1' : 'w-full',
          isShapefileSet && 'pl-4'
        )}>
          <div className="flex-shrink-0">
            <Icon className={cn(
              "h-8 w-8",
              isShapefileSet ? "text-primary" : "text-muted-foreground"
            )} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{file.name}</p>
              {isShapefileSet && (
                <span className="text-xs text-primary font-medium">Main File</span>
              )}
            </div>
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
              <p>
                {isShapefileSet 
                  ? `Download shapefile set (${formatBytes(file.size + (file.companion_files?.reduce((sum, f) => sum + f.size, 0) || 0))})`
                  : 'Download file'}
              </p>
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
              <p>
                {isShapefileSet 
                  ? 'Share shapefile set (copies download links)'
                  : 'Share file (copies link)'}
              </p>
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
              <p>
                {isShapefileSet 
                  ? 'Delete shapefile set'
                  : 'Delete file'}
              </p>
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

        {/* Companion Files Section */}
        {file.companion_files && file.companion_files.length > 0 && (
          <div className={cn(
            "mt-2",
            isShapefileSet ? "pl-8 border-l-2 border-primary/30" : "pl-4 border-l border-muted"
          )}>
            {!isShapefileSet && (
              <p className="text-xs font-medium text-muted-foreground mb-1">Companion Files:</p>
            )}
            {file.companion_files.map(companion => (
              <div key={companion.id} className="flex items-center gap-2 py-1">
                <FileIcon className={cn(
                  "h-4 w-4",
                  isShapefileSet ? "text-primary/70" : "text-muted-foreground"
                )} />
                <span className="text-xs font-mono">{companion.name}</span>
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  isShapefileSet ? "bg-primary/10 text-primary" : "text-muted-foreground"
                )}>
                  {companion.component_type}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Imported Files Section */}
        {file.importedFiles && file.importedFiles.length > 0 && (
          <div className="mt-2 pl-4 border-l border-muted">
            <p className="text-xs font-medium text-muted-foreground mb-1">Imported Files:</p>
            {file.importedFiles.map(importedFile => (
              <div key={importedFile.id} className="flex items-center gap-2 py-1">
                <FileJson className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-mono">{importedFile.name}</span>
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

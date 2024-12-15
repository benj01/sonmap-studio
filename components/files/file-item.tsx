'use client'

import { useState, useEffect } from 'react'
import { Card } from 'components/ui/card'
import { Button } from 'components/ui/button'
import { Database } from 'types/supabase'
import { Download, Trash2, FileIcon, MoreVertical, Import, Layers } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { formatBytes } from 'lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from 'components/ui/dropdown-menu'
import { createClient } from 'utils/supabase/client'
import { GeoImportDialog } from '../geo-loader/components/geo-import-dialog'
import { LoaderResult } from 'types/geo'
import { useToast } from 'components/ui/use-toast'
import { Progress } from 'components/ui/progress'

type ProjectFile = Database['public']['Tables']['project_files']['Row'] & {
  relatedFiles?: { [key: string]: string }
}

interface FileItemProps {
  file: ProjectFile
  viewMode: 'grid' | 'list'
  onDelete: (fileId: string) => void
  onImport?: (result: LoaderResult) => void
}

interface ShapeFile extends File {
  relatedFiles: {
    [key: string]: File
  }
}

export function FileItem({ file, viewMode, onDelete, onImport }: FileItemProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [fileForImport, setFileForImport] = useState<File | ShapeFile | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    const handleProgress = (event: CustomEvent<{ count: number }>) => {
      setLoadingProgress(event.detail.count)
    }

    window.addEventListener('shapefileLoadProgress', handleProgress as EventListener)
    return () => {
      window.removeEventListener('shapefileLoadProgress', handleProgress as EventListener)
    }
  }, [])

  const isShapefile = file.name.toLowerCase().endsWith('.shp')
  const hasRelatedFiles = isShapefile && file.relatedFiles && Object.keys(file.relatedFiles).length > 0

  const downloadFile = async (path: string, retryCount = 0): Promise<Blob> => {
    try {
      // Use the storage path directly if it's not a URL
      if (!path.startsWith('http')) {
        console.log('Downloading with direct path:', path)
        const { data, error } = await supabase.storage
          .from('project-files')
          .download(path)

        if (error) throw error
        if (!data) throw new Error('No data received')
        return data
      }

      // For URLs, extract just the file path part
      const url = new URL(path)
      const pathMatch = url.pathname.match(/\/(?:storage\/v1\/object\/public\/)?project-files\/([^/]+\/[^/]+)(?:\?|$)/)
      if (!pathMatch) {
        throw new Error('Invalid storage URL format')
      }

      const storagePath = decodeURIComponent(pathMatch[1])
      console.log('Downloading with extracted path:', storagePath)

      const { data, error } = await supabase.storage
        .from('project-files')
        .download(storagePath)

      if (error) {
        console.error('Download error:', error, 'for path:', storagePath)
        
        if (retryCount < 3) {
          const delay = 1000 * Math.pow(2, retryCount) // Exponential backoff
          console.log(`Retrying download (attempt ${retryCount + 1}) after ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          return downloadFile(path, retryCount + 1)
        }
        
        throw error
      }

      if (!data) {
        throw new Error('No data received from storage')
      }

      return data
    } catch (error) {
      console.error('Error downloading file:', error)
      throw new Error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  const createShapeFile = async (): Promise<ShapeFile> => {
    if (!hasRelatedFiles) {
      throw new Error('Missing required shapefile components')
    }

    try {
      // Required extensions for a valid shapefile
      const requiredExts = ['.dbf', '.shx']
      const missingExts = requiredExts.filter(ext => !file.relatedFiles![ext])
      
      if (missingExts.length > 0) {
        throw new Error(`Missing required shapefile components: ${missingExts.join(', ')}`)
      }

      // Download main .shp file first
      console.log('Downloading main shapefile from:', file.storage_path)
      const mainBlob = await downloadFile(file.storage_path)
      const shapeFile = new File([mainBlob], file.name, {
        type: 'application/x-esri-shape',
      }) as ShapeFile

      // Initialize the relatedFiles object
      shapeFile.relatedFiles = {}

      // Download related files sequentially
      for (const [ext, path] of Object.entries(file.relatedFiles!)) {
        try {
          console.log(`Downloading ${ext} file from:`, path)
          const blob = await downloadFile(path)
          const relatedFileName = file.name.replace('.shp', ext)
          shapeFile.relatedFiles[ext] = new File([blob], relatedFileName, {
            type: ext === '.dbf' ? 'application/x-dbf' : 'application/octet-stream'
          })
          console.log(`Successfully downloaded ${ext} file`)
        } catch (error) {
          console.error(`Error downloading ${ext} file:`, error)
          throw new Error(`Failed to download ${ext} component: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }

        // Small delay between downloads to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      return shapeFile
    } catch (error) {
      console.error('Error creating shapefile:', error)
      throw error
    }
  }

  const handleImportClick = async () => {
    try {
      setIsLoading(true)
      setLoadingProgress(0)

      let importFile: File | ShapeFile

      if (isShapefile && hasRelatedFiles) {
        importFile = await createShapeFile()
      } else {
        const blob = await downloadFile(file.storage_path)
        importFile = new File([blob], file.name, { type: file.file_type || blob.type })
      }

      setFileForImport(importFile)
      setIsImportDialogOpen(true)
    } catch (error) {
      console.error('Import error:', error)
      toast({
        variant: "destructive",
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import file"
      })
      setFileForImport(null)
    } finally {
      setIsLoading(false)
      setLoadingProgress(0)
    }
  }

  const handleImportComplete = (result: LoaderResult) => {
    onImport?.(result)
    setIsImportDialogOpen(false)
    setFileForImport(null)
    setLoadingProgress(0)
  }

  const FileTypeIcon = isShapefile ? Layers : FileIcon
  const fileTypeClass = isShapefile ? 'text-blue-500' : 'text-muted-foreground'

  if (viewMode === 'grid') {
    return (
      <>
        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <FileTypeIcon className={`h-12 w-12 ${fileTypeClass} mb-2`} />
              {isShapefile && hasRelatedFiles && (
                <div className="absolute -top-1 -right-1 bg-green-500 rounded-full w-3 h-3" />
              )}
            </div>
            <p className="font-medium truncate w-full mb-1">{file.name}</p>
            <p className="text-sm text-muted-foreground mb-1">
              {formatBytes(file.size)}
            </p>
            {isShapefile && hasRelatedFiles && (
              <p className="text-xs text-muted-foreground mb-2">
                + {Object.keys(file.relatedFiles!).length} related files
              </p>
            )}
            {isLoading && loadingProgress > 0 && (
              <div className="w-full mb-2">
                <Progress value={loadingProgress} className="h-1" />
                <p className="text-xs text-muted-foreground mt-1">
                  Loading features: {loadingProgress}
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline"
                title="Download file"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleImportClick}
                disabled={isLoading || (isShapefile && !hasRelatedFiles)}
                title={isShapefile && !hasRelatedFiles ? "Missing required components" : "Import file into project"}
              >
                <Import className="h-4 w-4" />
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="text-destructive"
                onClick={() => onDelete(file.id)}
                disabled={isDeleting || isLoading}
                title="Delete file"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
        <GeoImportDialog
          isOpen={isImportDialogOpen}
          onClose={() => {
            setIsImportDialogOpen(false)
            setFileForImport(null)
            setLoadingProgress(0)
          }}
          file={fileForImport}
          onImportComplete={handleImportComplete}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
        <div className="flex items-center gap-3">
          <div className="relative">
            <FileTypeIcon className={`h-8 w-8 ${fileTypeClass}`} />
            {isShapefile && hasRelatedFiles && (
              <div className="absolute -top-1 -right-1 bg-green-500 rounded-full w-2 h-2" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium">{file.name}</p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {formatBytes(file.size)} • Uploaded {formatDistanceToNow(new Date(file.uploaded_at))} ago
              </p>
              {isShapefile && hasRelatedFiles && (
                <span className="text-xs text-muted-foreground">
                  (+{Object.keys(file.relatedFiles!).length} components)
                </span>
              )}
            </div>
            {isLoading && loadingProgress > 0 && (
              <div className="mt-1">
                <Progress value={loadingProgress} className="h-1" />
                <p className="text-xs text-muted-foreground mt-1">
                  Loading features: {loadingProgress}
                </p>
              </div>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isLoading}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={handleImportClick} 
              disabled={isLoading || (isShapefile && !hasRelatedFiles)}
            >
              <Import className="mr-2 h-4 w-4" />
              Import
            </DropdownMenuItem>
            {isShapefile && hasRelatedFiles && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  Related Files:
                </DropdownMenuItem>
                {Object.keys(file.relatedFiles!).map(ext => (
                  <DropdownMenuItem key={ext} className="text-sm">
                    <FileIcon className="mr-2 h-3 w-3" />
                    {file.name.replace('.shp', ext)}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(file.id)}
              disabled={isDeleting || isLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <GeoImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => {
          setIsImportDialogOpen(false)
          setFileForImport(null)
          setLoadingProgress(0)
        }}
        file={fileForImport}
        onImportComplete={handleImportComplete}
      />
    </>
  )
}

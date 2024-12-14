'use client'

import { useState } from 'react'
import { Card } from 'components/ui/card'
import { Button } from 'components/ui/button'
import { Database } from 'types/supabase'
import { Download, Trash2, FileIcon, MoreVertical, Import } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { formatBytes } from 'lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/ui/dropdown-menu'
import { createClient } from 'utils/supabase/client'
import { GeoImportDialog } from '../geo-loader/components/geo-import-dialog'
import { LoaderResult } from 'types/geo'
import { useToast } from '@/components/ui/use-toast'

type ProjectFile = Database['public']['Tables']['project_files']['Row']

interface FileItemProps {
  file: ProjectFile
  viewMode: 'grid' | 'list'
  onDelete: (fileId: string) => void
  onImport?: (result: LoaderResult) => void
}

export function FileItem({ file, viewMode, onDelete, onImport }: FileItemProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [fileForImport, setFileForImport] = useState<File | null>(null)
  const supabase = createClient()
  const { toast } = useToast()

  const getRelatedShapefiles = async (basePath: string, baseName: string) => {
    const extensions = ['.shp', '.dbf', '.shx', '.prj']
    const files: { [key: string]: Blob } = {}

    try {
      await Promise.all(
        extensions.map(async (ext) => {
          const path = basePath.replace('.shp', ext)
          const { data, error } = await supabase.storage
            .from('project-files')
            .download(path)

          if (!error && data) {
            files[ext] = data
          }
        })
      )

      // Check if we have the minimum required files (.shp and .dbf)
      if (!files['.shp'] || !files['.dbf']) {
        throw new Error('Missing required shapefile components')
      }

      // Create a File object for the main .shp file that includes the related files
      const mainFile = new File([files['.shp']], `${baseName}.shp`, {
        type: 'application/x-esri-shape',
      })

      // Attach related files as a custom property
      ;(mainFile as any).relatedFiles = files

      return mainFile
    } catch (error) {
      throw new Error('Failed to load all shapefile components')
    }
  }

  const handleImportClick = async () => {
    try {
      let fileObj: File

      if (file.name.toLowerCase().endsWith('.shp')) {
        // For shapefiles, we need to get all related files
        const basePath = file.storage_path
        const baseName = file.name.slice(0, -4) // Remove .shp extension
        
        toast({
          title: "Loading shapefile",
          description: "Downloading all required components...",
        })
        
        fileObj = await getRelatedShapefiles(basePath, baseName)
      } else {
        // For other file types, just download the single file
        const { data, error } = await supabase.storage
          .from('project-files')
          .download(file.storage_path)

        if (error) throw error

        fileObj = new File([data], file.name, {
          type: data.type,
        })
      }

      setFileForImport(fileObj)
      setIsImportDialogOpen(true)
    } catch (error) {
      console.error('Error downloading file:', error)
      toast({
        variant: "destructive",
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import file"
      })
    }
  }

  const handleImportComplete = (result: LoaderResult) => {
    onImport?.(result)
    setIsImportDialogOpen(false)
    setFileForImport(null)
  }

  if (viewMode === 'grid') {
    return (
      <>
        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex flex-col items-center text-center">
            <FileIcon className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="font-medium truncate w-full mb-1">{file.name}</p>
            <p className="text-sm text-muted-foreground mb-2">
              {formatBytes(file.size)}
            </p>
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
                title="Import file into project"
              >
                <Import className="h-4 w-4" />
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="text-destructive"
                onClick={() => onDelete(file.id)}
                disabled={isDeleting}
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
          <FileIcon className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatBytes(file.size)} • Uploaded {formatDistanceToNow(new Date(file.uploaded_at))} ago
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImportClick}>
              <Import className="mr-2 h-4 w-4" />
              Import
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(file.id)}
              disabled={isDeleting}
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
        }}
        file={fileForImport}
        onImportComplete={handleImportComplete}
      />
    </>
  )
}

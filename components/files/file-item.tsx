'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Database } from '@/types/supabase'
import { Download, Trash2, FileIcon, MoreVertical, Import } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { formatBytes } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/utils/supabase/client'
import { GeoImportDialog } from '../geo-loader/components/geo-import-dialog'
import { LoaderResult } from '@/types/geo'

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

  const handleImportClick = async () => {
    try {
      // Download the file from storage
      const { data, error } = await supabase.storage
        .from('project-files')
        .download(file.storage_path)

      if (error) throw error

      // Convert the blob to a File object
      const fileObj = new File([data], file.name, {
        type: data.type,
      })

      setFileForImport(fileObj)
      setIsImportDialogOpen(true)
    } catch (error) {
      console.error('Error downloading file:', error)
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
              <Button size="sm" variant="outline">
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleImportClick}
              >
                <Import className="h-4 w-4" />
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="text-destructive"
                onClick={() => onDelete(file.id)}
                disabled={isDeleting}
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

'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from 'components/ui/card'
import { Button } from 'components/ui/button'
import { List, Grid } from 'lucide-react'
import { useToast } from 'components/ui/use-toast'
import { Database } from 'types/supabase'
import { S3FileUpload } from './s3-file-upload'
import { FileItem } from './file-item'
import { createClient } from 'utils/supabase/client'
import { LoaderResult } from 'types/geo'

type ProjectFile = Database['public']['Tables']['project_files']['Row']

interface FileManagerProps {
  projectId: string
  onGeoImport?: (result: LoaderResult, file: ProjectFile) => void
}

export function FileManager({ projectId, onGeoImport }: FileManagerProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    loadFiles()
  }, [projectId])

  const loadFiles = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false })

      if (error) throw error
      setFiles(data || [])
    } catch (error) {
      console.error('Error loading files:', error)
      toast({
        title: 'Error',
        description: 'Failed to load files',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const refreshProjectStorage = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('storage_used')
        .eq('id', projectId)
        .single()

      if (error) throw error
      console.log('Updated storage usage:', data.storage_used)
    } catch (error) {
      console.error('Error refreshing storage:', error)
    }
  }

  const handleUploadComplete = async (uploadedFile: { 
    name: string; 
    size: number; 
    type: string;
    relatedFiles?: { [key: string]: string }
  }) => {
    try {
      const storagePath = `${projectId}/${uploadedFile.name}`
      
      // Add the uploaded file to the database
      const { data: newFile, error } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          name: uploadedFile.name,
          size: uploadedFile.size,
          file_type: uploadedFile.type,
          storage_path: storagePath,
          metadata: uploadedFile.relatedFiles ? {
            relatedFiles: uploadedFile.relatedFiles
          } : null
        })
        .select()
        .single()

      if (error) throw error

      // Update local state
      setFiles(prevFiles => [
        {
          ...newFile,
          relatedFiles: uploadedFile.relatedFiles
        } as any,
        ...prevFiles
      ])
      await refreshProjectStorage()

      toast({
        title: 'Success',
        description: uploadedFile.relatedFiles
          ? 'Shapefile and related components uploaded successfully'
          : 'File uploaded successfully',
      })
    } catch (error) {
      console.error('Error uploading file:', error)
      toast({
        title: 'Error',
        description: 'Failed to save uploaded file to the database',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    try {
      const fileToDelete = files.find(f => f.id === fileId)
      if (!fileToDelete) {
        console.error('File not found:', fileId)
        return
      }

      // Delete from database first
      console.log('Deleting from database:', fileId, projectId)
      const { error: dbError, count } = await supabase
        .from('project_files')
        .delete()
        .match({
          id: fileId,
          project_id: projectId
        })
        .select()

      if (dbError) {
        console.error('Database deletion error:', dbError)
        throw dbError
      }

      console.log('Database deletion result:', count)

      if (count === 0) {
        throw new Error('File not found in database')
      }

      // Delete main file and any related files from storage
      const storagePaths = [fileToDelete.storage_path.replace(/^projects\//, '')]
      
      // Add related file paths if this is a shapefile
      const metadata = fileToDelete.metadata as { relatedFiles?: { [key: string]: string } } | null
      if (metadata?.relatedFiles) {
        Object.values(metadata.relatedFiles).forEach(path => {
          storagePaths.push(path.replace(/^projects\//, ''))
        })
      }

      // Delete all files from storage
      const { error: storageError } = await supabase.storage
        .from('project-files')
        .remove(storagePaths)

      if (storageError) {
        console.error('Storage deletion error:', storageError)
        throw storageError
      }

      // Update local state
      setFiles(prevFiles => prevFiles.filter(f => f.id !== fileId))
      await refreshProjectStorage()

      toast({
        title: 'Success',
        description: 'File and related components deleted successfully',
      })
    } catch (error) {
      console.error('Delete error:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete file',
        variant: 'destructive',
      })
      // Refresh files list to ensure UI is in sync
      await loadFiles()
    }
  }

  const handleImport = (result: LoaderResult, file: ProjectFile) => {
    if (onGeoImport) {
      onGeoImport(result, file)
      toast({
        title: 'Success',
        description: 'File imported successfully',
      })
    }
  }

  // Process files to add relatedFiles from metadata
  const processedFiles = files.map(file => {
    const metadata = file.metadata as { relatedFiles?: { [key: string]: string } } | null
    return {
      ...file,
      relatedFiles: metadata?.relatedFiles
    }
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Project Files</CardTitle>
            <CardDescription>
              Upload and manage your project files
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <S3FileUpload
              projectId={projectId}
              onUploadComplete={handleUploadComplete}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading files...</p>
          </div>
        ) : processedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground text-sm">
              No files uploaded yet. Click upload to add files.
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-4 gap-4' : 'space-y-2'}>
            {processedFiles.map(file => (
              <FileItem
                key={file.id}
                file={file}
                viewMode={viewMode}
                onDelete={handleDeleteFile}
                onImport={(result) => handleImport(result, file)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

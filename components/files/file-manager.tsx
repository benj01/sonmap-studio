'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { List, Grid } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Database } from '@/types/supabase'
import { FileUpload } from './file-upload'
import { FileItem } from './file-item'
import { createClient } from '@/utils/supabase/client'

type ProjectFile = Database['public']['Tables']['project_files']['Row']

interface FileManagerProps {
  projectId: string
}

export function FileManager({ projectId }: FileManagerProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    async function checkSession() {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Error fetching session:', error)
        return
      }
      console.log('Authenticated user ID:', data?.session?.user?.id)
    }
    checkSession()
  }, [])

  useEffect(() => {
    loadFiles()
  }, [projectId])

  const loadFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false })

      if (error) throw error
      setFiles(data || [])
    } catch (error) {
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
      // Fetch updated project data to get new storage value
      const { data, error } = await supabase
        .from('projects')
        .select('storage_used')
        .eq('id', projectId)
        .single()

      if (error) throw error

      // The database trigger we created earlier should have updated the storage_used value
      console.log('Updated storage usage:', data.storage_used)
    } catch (error) {
      console.error('Error refreshing storage:', error)
    }
  }

  const handleUploadComplete = async (newFile: ProjectFile) => {
    setFiles(prevFiles => [newFile, ...prevFiles])
    await refreshProjectStorage()
  }

  const handleDeleteFile = async (fileId: string) => {
    try {
      const fileToDelete = files.find(f => f.id === fileId)
      if (!fileToDelete) return

      const { error: storageError } = await supabase.storage
        .from('project-files')
        .remove([fileToDelete.storage_path])

      if (storageError) throw storageError

      const { error: dbError } = await supabase
        .from('project_files')
        .delete()
        .eq('id', fileId)

      if (dbError) throw dbError

      setFiles(prevFiles => prevFiles.filter(f => f.id !== fileId))
      await refreshProjectStorage() // Refresh storage after delete

      toast({
        title: 'Success',
        description: 'File deleted successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete file',
        variant: 'destructive',
      })
    }
  }

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
            <FileUpload 
              projectId={projectId} 
              onUploadComplete={handleUploadComplete}
              onStorageUpdate={refreshProjectStorage}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground text-sm">
              No files uploaded yet. Click upload to add files.
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-4 gap-4' : 'space-y-2'}>
            {files.map(file => (
              <FileItem
                key={file.id}
                file={file}
                viewMode={viewMode}
                onDelete={handleDeleteFile}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
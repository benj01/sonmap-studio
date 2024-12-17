import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from 'components/ui/card'
import { Button } from 'components/ui/button'
import { List, Grid } from 'lucide-react'
import { useToast } from 'components/ui/use-toast'
import { Database } from 'types/supabase'
import { S3FileUpload } from './s3-file-upload'
import { FileItem } from './file-item'
import { createClient } from 'utils/supabase/client'
import { LoaderResult, ImportMetadata } from 'types/geo'
import { COORDINATE_SYSTEMS } from '../geo-loader/types/coordinates'

type ProjectFile = Database['public']['Tables']['project_files']['Row'] & {
  importedFiles?: ProjectFile[]
}

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
      
      // First, get all files for the project
      const { data: allFiles, error: filesError } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false })

      if (filesError) throw filesError

      // Group imported files with their source files
      const fileMap = new Map<string, ProjectFile & { importedFiles?: ProjectFile[] }>()
      
      allFiles.forEach(file => {
        if (file.source_file_id) {
          // This is an imported file
          const sourceFile = fileMap.get(file.source_file_id)
          if (sourceFile) {
            sourceFile.importedFiles = sourceFile.importedFiles || []
            sourceFile.importedFiles.push(file)
          }
        } else {
          // This is a source file
          if (!fileMap.has(file.id)) {
            fileMap.set(file.id, { ...file, importedFiles: [] })
          }
        }
      })

      setFiles(Array.from(fileMap.values()))
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
    name: string
    size: number
    type: string
    relatedFiles?: { [key: string]: string }
  }) => {
    try {
      const storagePath = `${projectId}/${uploadedFile.name}`
      
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

      setFiles(prevFiles => [
        { ...newFile, importedFiles: [] },
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

  const handleImport = async (result: LoaderResult, sourceFile: ProjectFile) => {
    try {
      // Create GeoJSON file from import result
      const geoJsonContent = JSON.stringify({
        type: 'FeatureCollection',
        features: result.features
      })

      // Create a Blob and File from the GeoJSON content
      const blob = new Blob([geoJsonContent], { type: 'application/geo+json' })
      const geoJsonFile = new File([blob], `${sourceFile.name}.geojson`, { type: 'application/geo+json' })

      // Upload GeoJSON file to storage
      const storagePath = `${projectId}/imported/${geoJsonFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, geoJsonFile)

      if (uploadError) throw uploadError

      // Create import metadata with proper coordinate system handling
      const importMetadata: ImportMetadata = {
        sourceFile: {
          id: sourceFile.id,
          name: sourceFile.name
        },
        importedLayers: result.layers.map(layer => ({
          name: layer,
          featureCount: result.features.filter(f => f.properties?.layer === layer).length,
          featureTypes: result.statistics?.featureTypes || {}
        })),
        coordinateSystem: {
          source: result.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
          target: COORDINATE_SYSTEMS.WGS84
        },
        statistics: {
          totalFeatures: result.features.length,
          failedTransformations: result.statistics?.failedTransformations,
          errors: result.statistics?.errors
        },
        importedAt: new Date().toISOString()
      }

      // Save imported file record
      const { data: importedFile, error: dbError } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          name: geoJsonFile.name,
          size: geoJsonFile.size,
          file_type: 'application/geo+json',
          storage_path: storagePath,
          source_file_id: sourceFile.id,
          is_imported: true,
          import_metadata: importMetadata
        })
        .select()
        .single()

      if (dbError) throw dbError

      // Update local state
      setFiles(prevFiles => {
        return prevFiles.map(file => {
          if (file.id === sourceFile.id) {
            return {
              ...file,
              importedFiles: [...(file.importedFiles || []), importedFile]
            }
          }
          return file
        })
      })

      if (onGeoImport) {
        onGeoImport(result, importedFile)
      }

      toast({
        title: 'Success',
        description: 'File imported and converted to GeoJSON successfully',
      })
    } catch (error) {
      console.error('Import error:', error)
      toast({
        title: 'Error',
        description: 'Failed to import and convert file',
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

      // Get all related imported files
      const { data: importedFiles } = await supabase
        .rpc('get_imported_files', { source_file_id: fileId })

      // Collect all storage paths to delete
      const storagePaths = [
        fileToDelete.storage_path.replace(/^projects\//, ''),
        ...(importedFiles || []).map((f: { storage_path: string }) => f.storage_path.replace(/^projects\//, ''))
      ]

      // Delete all files from storage
      const { error: storageError } = await supabase.storage
        .from('project-files')
        .remove(storagePaths)

      if (storageError) throw storageError

      // Delete from database (cascade will handle imported files)
      const { error: dbError } = await supabase
        .from('project_files')
        .delete()
        .eq('id', fileId)

      if (dbError) throw dbError

      // Update local state
      setFiles(prevFiles => prevFiles.filter(f => f.id !== fileId))
      await refreshProjectStorage()

      toast({
        title: 'Success',
        description: 'File and related imports deleted successfully',
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
                onImport={(result) => handleImport(result, file)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

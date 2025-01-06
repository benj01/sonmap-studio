import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from 'components/ui/card'
import { Button } from 'components/ui/button'
import { List, Grid, FileIcon } from 'lucide-react'
import { useToast } from 'components/ui/use-toast'
import { S3FileUpload } from './s3-file-upload'
import { FileItem } from './file-item'
import { createClient } from 'utils/supabase/client'
import { LoaderResult, ImportMetadata } from 'types/geo'
import { COORDINATE_SYSTEMS } from '../geo-loader/types/coordinates'
import { ProjectFile, UploadedFile, FileWithCompanions, ProjectFileBase } from './types'
import { ImportLogDialog } from './import-log-dialog'

interface FileManagerProps {
  projectId: string
  onGeoImport?: (result: LoaderResult, file: ProjectFile) => void
}

export function FileManager({ projectId, onGeoImport }: FileManagerProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showImportLog, setShowImportLog] = useState(false)
  const [importLogs, setImportLogs] = useState<Array<{
    type: 'info' | 'error' | 'success';
    message: string;
    timestamp: Date;
  }>>([])
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    loadFiles()
  }, [projectId])

  const loadFiles = async () => {
    try {
      setIsLoading(true)
      
      // Get files with their companions using the new function
      // Get files with companions and log raw response
      const { data: filesWithCompanions, error: filesError } = await supabase
        .rpc('get_project_files_with_companions', { project_id_param: projectId })

      if (filesError) {
        console.error('Error fetching files:', filesError);
        throw filesError;
      }

      console.log('Raw database response:', filesWithCompanions);

      // Get imported files
      const { data: allFiles, error: importedError } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_imported', true)
        .order('uploaded_at', { ascending: false })

      if (importedError) throw importedError

      // Combine companion files and imported files
      const fileMap = new Map<string, ProjectFile>()
      
      // First, add all main files with their companions
      ;(filesWithCompanions as FileWithCompanions[]).forEach((file) => {
        // Log each file's details before processing
        console.log('Processing file:', {
          id: file.id,
          name: file.name,
          file_type: file.file_type,
          is_shapefile_component: file.is_shapefile_component,
          companion_files: file.companion_files?.length || 0
        });
        
        const projectFile: ProjectFile = {
          ...file,
          importedFiles: [],
          companion_files: file.companion_files || []
        }
        fileMap.set(file.id, projectFile)
      })

      // Then, add imported files to their source files
      ;(allFiles as ProjectFileBase[]).forEach((importedFile) => {
        if (importedFile.source_file_id) {
          const sourceFile = fileMap.get(importedFile.source_file_id)
          if (sourceFile && !sourceFile.importedFiles?.some(f => f.id === importedFile.id)) {
            sourceFile.importedFiles = sourceFile.importedFiles || []
            sourceFile.importedFiles.push({
              ...importedFile,
              importedFiles: [],
              companion_files: []
            })
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

  const handleUploadComplete = async (uploadedFile: UploadedFile) => {
    try {
      console.log('Handling upload complete:', uploadedFile);  // Debug log

      // Check if file with same name already exists
      const { data: existingFiles } = await supabase
        .from('project_files')
        .select('name')
        .eq('project_id', projectId)
        .eq('name', uploadedFile.name)
        .eq('is_shapefile_component', false)
        .maybeSingle()

      if (existingFiles) {
        toast({
          title: 'Error',
          description: `A file named "${uploadedFile.name}" already exists. Please rename the file before uploading.`,
          variant: 'destructive',
        })
        return
      }

      const storagePath = `${projectId}/${uploadedFile.name}`
      
      if (uploadedFile.type === 'application/x-shapefile') {
      console.log('Processing shapefile with details:', {
        name: uploadedFile.name,
        type: uploadedFile.type,
        size: uploadedFile.size,
        relatedFiles: uploadedFile.relatedFiles
      });
        // For shapefiles, first insert the main file
        // Calculate main file size by subtracting companion file sizes from total
        const companionSizes = uploadedFile.relatedFiles 
          ? Object.values(uploadedFile.relatedFiles).reduce((sum, file) => sum + file.size, 0)
          : 0;
        const mainFileSize = uploadedFile.size - companionSizes;

        // Explicitly set the MIME type for shapefiles
        const fileType = 'application/x-shapefile';
        
        // Ensure all required fields are present and correctly typed
        const mainFileData = {
          project_id: projectId,
          name: uploadedFile.name,
          size: mainFileSize,
          file_type: fileType,
          storage_path: storagePath,
          is_shapefile_component: false,
          uploaded_at: new Date().toISOString(), // Add timestamp
          metadata: {} // Add empty metadata object
        };
        
        console.log('Inserting main file with data:', mainFileData);

        // Log the exact data we're sending to the database
        console.log('Attempting to insert main file with exact data:', JSON.stringify(mainFileData, null, 2));
        
        const { data: mainFile, error: mainError } = await supabase
          .from('project_files')
          .insert(mainFileData)
          .select()
          .single()

        if (mainError) {
          console.error('Error inserting main file:', {
            error: mainError,
            data: mainFileData
          });
          throw mainError;
        }

        // Verify what was actually saved
        const { data: verifyFile, error: verifyError } = await supabase
          .from('project_files')
          .select('*')
          .eq('id', mainFile.id)
          .single()

        if (verifyError) {
          console.error('Error verifying saved file:', verifyError);
        } else {
          console.log('Verified saved file data:', {
            id: verifyFile.id,
            name: verifyFile.name,
            file_type: verifyFile.file_type,
            is_shapefile_component: verifyFile.is_shapefile_component
          });
        }

        console.log('Main file inserted successfully:', {
          id: mainFile.id,
          name: mainFile.name,
          file_type: mainFile.file_type  // Log the file_type from the database response
        });

        console.log('Main file inserted:', mainFile);  // Debug log

        // Then insert companion files with their correct sizes
        if (uploadedFile.relatedFiles) {
          const companions = Object.entries(uploadedFile.relatedFiles).map(([ext, file]) => ({
            project_id: projectId,
            name: file.name,
            size: file.size,
            file_type: 'application/octet-stream',
            storage_path: file.path,
            is_shapefile_component: true,
            main_file_id: mainFile.id,
            component_type: ext.substring(1), // Remove the dot from extension
            uploaded_at: new Date().toISOString(), // Add timestamp
            metadata: {} // Add empty metadata object
          }))

          console.log('Inserting companion files:', companions);  // Debug log

          const { error: companionsError } = await supabase
            .from('project_files')
            .insert(companions)

          if (companionsError) throw companionsError
        }
      } else {
        // For non-shapefiles, just insert the single file
        const fileData = {
          project_id: projectId,
          name: uploadedFile.name,
          size: uploadedFile.size,
          file_type: uploadedFile.type,
          storage_path: storagePath,
          is_shapefile_component: false,
          uploaded_at: new Date().toISOString(),
          metadata: {}
        };

        console.log('Inserting single file with data:', JSON.stringify(fileData, null, 2));

        const { error: fileError } = await supabase
          .from('project_files')
          .insert(fileData)

        if (fileError) throw fileError
      }

      // Refresh files list to get the complete structure
      await loadFiles()
      await refreshProjectStorage()

      toast({
        title: 'Success',
        description: uploadedFile.relatedFiles
          ? 'Shapefile and companion files uploaded successfully'
          : 'File uploaded successfully',
      })
    } catch (error) {
      console.error('Error saving file:', error)
      toast({
        title: 'Error',
        description: 'Failed to save file to the database',
        variant: 'destructive',
      })
    }
  }

  const handleImport = async (result: LoaderResult, sourceFile: ProjectFile) => {
    setImportLogs([])
    setShowImportLog(true)
    
    const addLog = (type: 'info' | 'error' | 'success', message: string) => {
      setImportLogs(logs => [...logs, { type, message, timestamp: new Date() }])
    }

    try {
      addLog('info', `Starting import of ${sourceFile.name}`)
      // Create GeoJSON file from import result
      addLog('info', 'Converting to GeoJSON format...')
      const geoJsonContent = JSON.stringify({
        type: 'FeatureCollection',
        features: result.features
      })
      addLog('success', `Successfully converted ${result.features.length} features to GeoJSON`)

      // Create a Blob and File from the GeoJSON content
      const blob = new Blob([geoJsonContent], { type: 'application/geo+json' })
      const geoJsonFile = new File([blob], `${sourceFile.name}.geojson`, { type: 'application/geo+json' })

      // Upload GeoJSON file to storage
      addLog('info', 'Uploading converted file...')
      const storagePath = `${projectId}/imported/${geoJsonFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, geoJsonFile)

      if (uploadError) {
        addLog('error', `Upload failed: ${uploadError.message}`)
        throw uploadError
      }
      addLog('success', 'File uploaded successfully')

      // Create import metadata
      addLog('info', 'Processing import metadata...')
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
      addLog('info', 'Saving import record...')
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
          import_metadata: importMetadata,
          uploaded_at: new Date().toISOString(),
          metadata: {},
          is_shapefile_component: false
        })
        .select()
        .single()

      if (dbError) {
        addLog('error', `Database error: ${dbError.message}`)
        throw dbError
      }
      addLog('success', 'Import record saved successfully')

      // Update local state
      setFiles(prevFiles => {
        return prevFiles.map(file => {
          if (file.id === sourceFile.id) {
            return {
              ...file,
              importedFiles: [...(file.importedFiles || []), {
                ...importedFile,
                importedFiles: [],
                companion_files: []
              }]
            }
          }
          return file
        })
      })

      if (onGeoImport) {
        onGeoImport(result, importedFile)
      }

      addLog('success', 'Import completed successfully')
      toast({
        title: 'Success',
        description: 'File imported and converted to GeoJSON successfully',
      })
    } catch (error) {
      console.error('Import error:', error)
      addLog('error', `Import failed: ${error instanceof Error ? error.message : String(error)}`)
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

      // Get all storage paths to delete (main file + companions + imported files)
      const storagePaths = [
        fileToDelete.storage_path.replace(/^projects\//, ''),
        ...(fileToDelete.companion_files || []).map(f => f.storage_path.replace(/^projects\//, '')),
        ...(fileToDelete.importedFiles || []).map(f => f.storage_path.replace(/^projects\//, ''))
      ]

      // Delete files from storage
      const { error: storageError } = await supabase.storage
        .from('project-files')
        .remove(storagePaths)

      if (storageError) throw storageError

      // Delete from database (triggers will handle companions and imported files)
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
        description: 'File and related files deleted successfully',
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
    <>
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
                <div key={file.id} className={viewMode === 'grid' ? 'flex flex-col' : ''}>
                  <FileItem
                    file={file}
                    viewMode={viewMode}
                    onDelete={handleDeleteFile}
                    onImport={(result) => handleImport(result, file)}
                  />
                  {file.companion_files && file.companion_files.length > 0 && (
                    <div className={`
                      ${viewMode === 'grid' ? 'mt-2 pl-4' : 'ml-8 mt-1'}
                      space-y-1 border-l-2 border-muted pl-2
                    `}>
                      {file.companion_files.map(companion => (
                        <div 
                          key={companion.id}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <FileIcon className="h-4 w-4" />
                          <span className="font-mono">{companion.name}</span>
                          <span className="text-xs">
                            ({Math.round(companion.size / 1024)} KB)
                          </span>
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            {companion.component_type?.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    <ImportLogDialog 
      open={showImportLog}
      onOpenChange={setShowImportLog}
      logs={importLogs}
    />
    </>
  )
}

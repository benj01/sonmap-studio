'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { Progress } from '@/components/ui/progress'
import { Database } from '@/types/supabase'

type ProjectFile = Database['public']['Tables']['project_files']['Row']

interface FileUploadProps {
  projectId: string
  onUploadComplete: (file: ProjectFile) => void
}

export function FileUpload({ projectId, onUploadComplete }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const supabase = createClient()

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      // Create a unique storage path
      const storagePath = `projects/${projectId}/${Date.now()}-${file.name}`

      // Upload file to Supabase Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, file, {
          onUploadProgress: (progress) => {
            const percent = (progress.loaded / progress.total) * 100
            setUploadProgress(percent)
          },
        })

      if (storageError) throw storageError

      // Create database record
      const { data: fileRecord, error: dbError } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          name: file.name,
          size: file.size,
          file_type: file.type,
          storage_path: storagePath,
          metadata: {
            contentType: file.type,
            lastModified: file.lastModified,
          },
        })
        .select()
        .single()

      if (dbError) throw dbError

      toast({
        title: 'Success',
        description: 'File uploaded successfully',
      })

      onUploadComplete(fileRecord)
    } catch (error) {
      console.error('Upload error:', error)
      toast({
        title: 'Error',
        description: 'Failed to upload file. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
        disabled={isUploading}
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        <Upload className="mr-2 h-4 w-4" />
        {isUploading ? 'Uploading...' : 'Upload Files'}
      </Button>
      {isUploading && (
        <Progress value={uploadProgress} className="mt-2" />
      )}
    </div>
  )
}

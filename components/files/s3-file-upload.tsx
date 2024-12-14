'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { getSignedUploadUrl } from 'utils/supabase/s3';
import { Progress } from '../ui/progress';

interface S3FileUploadProps {
  onUploadComplete?: (file: { name: string; size: number; type: string }) => void;
}

export function S3FileUpload({ onUploadComplete }: S3FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to upload.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const signedUrl = await getSignedUploadUrl(selectedFile.name);

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', selectedFile.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          toast({
            title: 'Success',
            description: 'File uploaded successfully',
          });

          onUploadComplete?.({
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type,
          });

          setSelectedFile(null);
          setUploadProgress(0);
        } else {
          toast({
            title: 'Error',
            description: 'Upload failed.',
            variant: 'destructive',
          });
        }
      };

      xhr.onerror = () => {
        toast({
          title: 'Error',
          description: 'Network error during upload.',
          variant: 'destructive',
        });
      };

      xhr.send(selectedFile);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Error',
        description: `Error uploading file: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <input 
        type="file" 
        accept=".txt,.csv,.xyz,.dxf,.shp"
        onChange={handleFileChange} 
      />
      <Button onClick={handleUpload} disabled={!selectedFile || uploadProgress > 0}>
        Upload
      </Button>
      {uploadProgress > 0 && <Progress value={uploadProgress} className="mt-2" />}
    </div>
  );
}

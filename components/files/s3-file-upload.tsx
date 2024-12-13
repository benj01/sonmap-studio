'use client';

import { useState } from 'react';
import { Upload } from '@aws-sdk/lib-storage';
import { createS3Client } from '@/utils/supabase/s3';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { useLoadingState } from '@/utils/hooks/useLoadingState';


export function S3FileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();
  const { isLoading, setLoading } = useLoadingState()

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

   setLoading(true)
   try {
      const s3Client = await createS3Client();
       const upload = new Upload(s3Client, {
          Bucket: 'test-bucket-s3-upload', // Replace with your bucket name
          Key: selectedFile.name,
          Body: selectedFile,
          ContentType: selectedFile.type,
       });

       await upload.done();

       toast({
         title: 'Success',
         description: 'File uploaded successfully',
       });
   } catch (error: any) {
     console.error('Error uploading file:', error);
     toast({
       title: 'Error',
       description: `Error uploading file: ${error.message}`,
       variant: 'destructive'
     });
  } finally {
     setLoading(false)
  }
  };

  return (
    <div>
      <input type="file" accept='image/*' onChange={handleFileChange} />
       <Button onClick={handleUpload} disabled={!selectedFile || isLoading} loading={isLoading}>Upload</Button>
    </div>
  );
}
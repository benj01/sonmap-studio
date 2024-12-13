'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { useLoadingState } from '@/utils/hooks/useLoadingState';
import { getSignedUploadUrl } from '@/utils/supabase/s3';

export function S3FileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();
  const { isLoading, setLoading } = useLoadingState();

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

    setLoading(true);
    try {
      const signedUrl = await getSignedUploadUrl(selectedFile.name);

      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      toast({
        title: 'Success',
        description: 'File uploaded successfully',
      });
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Error',
        description: `Error uploading file: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      <Button onClick={handleUpload} disabled={!selectedFile || isLoading} loading={isLoading}>
        Upload
      </Button>
    </div>
  );
}
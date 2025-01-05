'use client';

import { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { getSignedUploadUrl } from 'utils/supabase/s3';
import { Progress } from '../ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react';

interface S3FileUploadProps {
  projectId: string;
  onUploadComplete?: (file: { name: string; size: number; type: string; relatedFiles?: { [key: string]: string } }) => void;
}

// Shapefile extensions that should be grouped together
const SHAPEFILE_EXTENSIONS = ['.shp', '.shx', '.dbf', '.prj'];

export function S3FileUpload({ projectId, onUploadComplete }: S3FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [fileGroups, setFileGroups] = useState<{ [key: string]: File[] }>({});
  const [validationStatus, setValidationStatus] = useState<{ [key: string]: boolean }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFiles(event.target.files);
      const groups = groupShapefileComponents(event.target.files);
      setFileGroups(groups);
      
      // Validate each shapefile group
      const status: { [key: string]: boolean } = {};
      Object.entries(groups).forEach(([baseName, files]) => {
        status[baseName] = ['.shp', '.shx', '.dbf'].every(ext => 
          files.some(f => f.name.toLowerCase().endsWith(ext))
        );
      });
      setValidationStatus(status);
      
      setShowUploadDialog(true);
    }
  };

  // Group related shapefile components
  const groupShapefileComponents = (files: FileList) => {
    const groups: { [key: string]: File[] } = {};
    
    Array.from(files).forEach(file => {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (SHAPEFILE_EXTENSIONS.includes(ext)) {
        // Get the base name without extension
        const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
        if (!groups[baseName]) {
          groups[baseName] = [];
        }
        groups[baseName].push(file);
      }
    });

    return groups;
  };

  const uploadFile = async (file: File): Promise<string> => {
    const signedUrl = await getSignedUploadUrl(file.name, projectId);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(signedUrl.split('?')[0]); // Return the base URL without query params
        } else {
          reject(new Error(`Failed to upload ${file.name}`));
        }
      };

      xhr.onerror = () => reject(new Error(`Network error uploading ${file.name}`));
      xhr.send(file);
    });
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select files to upload.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const shapefileGroups = groupShapefileComponents(selectedFiles);
      
      // Upload each group of files
      for (const [baseName, files] of Object.entries(shapefileGroups)) {
        const mainFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
        if (!mainFile) continue;

        // Check if we have all required components
        const hasRequiredFiles = ['.shp', '.shx', '.dbf'].every(ext => 
          files.some(f => f.name.toLowerCase().endsWith(ext))
        );

        if (!hasRequiredFiles) {
          toast({
            title: 'Missing Files',
            description: `Shapefile "${baseName}" is missing required components (.shp, .shx, .dbf)`,
            variant: 'destructive',
          });
          continue;
        }

        // Upload all files in the group
        const relatedFiles: { [key: string]: string } = {};
        let totalSize = 0;

        for (const file of files) {
          const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
          const uploadedUrl = await uploadFile(file);
          if (ext !== '.shp') {
            relatedFiles[ext] = uploadedUrl;
          }
          totalSize += file.size;
          
          // Update progress for each file
          setUploadProgress((prev) => prev + (100 / (files.length * Object.keys(shapefileGroups).length)));
        }

        // Notify completion for the main .shp file with references to related files
        onUploadComplete?.({
          name: mainFile.name,
          size: totalSize,
          type: 'application/x-shapefile',
          relatedFiles
        });
      }

      // Upload non-shapefile files
      const regularFiles = Array.from(selectedFiles).filter(file => {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        return !SHAPEFILE_EXTENSIONS.includes(ext);
      });

      for (const file of regularFiles) {
        await uploadFile(file);
        onUploadComplete?.({
          name: file.name,
          size: file.size,
          type: file.type
        });
        setUploadProgress((prev) => prev + (100 / (regularFiles.length + Object.keys(shapefileGroups).length)));
      }

      toast({
        title: 'Success',
        description: 'All files uploaded successfully',
      });

      setSelectedFiles(null);
      setUploadProgress(0);
    } catch (error: any) {
      console.error('Error uploading files:', error);
      toast({
        title: 'Error',
        description: `Error uploading files: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input 
        ref={fileInputRef}
        type="file" 
        accept=".txt,.csv,.xyz,.dxf,.shp,.dbf,.shx,.prj"
        onChange={handleFileChange}
        multiple 
        className="hidden"
      />
      <Button onClick={triggerFileInput}>
        <Upload className="mr-2 h-4 w-4" />
        Select Files
      </Button>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            {Object.entries(fileGroups).map(([baseName, files]) => (
              <div key={baseName} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  {validationStatus[baseName] ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  <h3 className="font-medium">{baseName}</h3>
                </div>
                
                {!validationStatus[baseName] && (
                  <Alert className="mb-2 border-yellow-500 text-yellow-700">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription>
                      Missing required files. A shapefile needs .shp, .shx, and .dbf files.
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="pl-7 text-sm text-muted-foreground">
                  {files.map(file => (
                    <div key={file.name} className="flex items-center gap-2">
                      <span>{file.name.substring(file.name.lastIndexOf('.'))}</span>
                      <span>({Math.round(file.size / 1024)} KB)</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {uploadProgress > 0 && (
              <Progress value={uploadProgress} className="mt-4" />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={!selectedFiles || uploadProgress > 0 || Object.values(validationStatus).some(status => !status)}
            >
              Upload Files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

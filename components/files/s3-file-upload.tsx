'use client';

import { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { getSignedUploadUrl } from 'utils/supabase/s3';
import { Progress } from '../ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { Upload, AlertCircle, CheckCircle2, FileIcon } from 'lucide-react';

interface S3FileUploadProps {
  projectId: string;
  onUploadComplete?: (file: { name: string; size: number; type: string; relatedFiles?: { [key: string]: string } }) => void;
}

// Shapefile extensions that should be grouped together
const SHAPEFILE_EXTENSIONS = ['.shp', '.shx', '.dbf', '.prj'];
const REQUIRED_SHAPEFILE_EXTENSIONS = ['.shp', '.shx', '.dbf'];

export function S3FileUpload({ projectId, onUploadComplete }: S3FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [fileGroups, setFileGroups] = useState<{ [key: string]: File[] }>({});
  const [validationStatus, setValidationStatus] = useState<{ [key: string]: boolean }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const findShapefileCompanions = (mainFile: File, fileList: FileList): File[] => {
    const baseName = mainFile.name.substring(0, mainFile.name.lastIndexOf('.')).toLowerCase();
    const companions: File[] = [mainFile];
    
    // Look for companion files in the FileList
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const fileName = file.name.toLowerCase();
      const ext = fileName.substring(fileName.lastIndexOf('.'));
      
      if (fileName.startsWith(baseName) && SHAPEFILE_EXTENSIONS.includes(ext) && file !== mainFile) {
        companions.push(file);
      }
    }
    
    return companions;
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const files = Array.from(event.target.files);
    const mainFile = files[0];
    const ext = mainFile.name.substring(mainFile.name.lastIndexOf('.')).toLowerCase();
    
    // If it's a shapefile, automatically find and include companion files
    if (ext === '.shp') {
      const companions = findShapefileCompanions(mainFile, event.target.files);
      const baseName = mainFile.name.substring(0, mainFile.name.lastIndexOf('.'));
      
      setSelectedFiles(companions);
      const groups = { [baseName]: companions };
      setFileGroups(groups);

      // Validate that all required files are present
      const status: { [key: string]: boolean } = {};
      status[baseName] = REQUIRED_SHAPEFILE_EXTENSIONS.every(ext => 
        companions.some(f => f.name.toLowerCase().endsWith(ext))
      );
      setValidationStatus(status);

      if (!status[baseName]) {
        const missingExts = REQUIRED_SHAPEFILE_EXTENSIONS.filter(ext => 
          !companions.some(f => f.name.toLowerCase().endsWith(ext))
        );
        
        toast({
          title: 'Missing Required Files',
          description: `Missing required companion files: ${missingExts.join(', ')}. These files should be in the same directory as ${mainFile.name}.`,
          variant: 'destructive',
        });
      }
    } else {
      // For non-shapefile uploads, just use the selected file
      setSelectedFiles([mainFile]);
      setFileGroups({});
      setValidationStatus({});
    }
    
    setShowUploadDialog(true);
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
    if (selectedFiles.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select files to upload.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Handle shapefile groups
      for (const [baseName, files] of Object.entries(fileGroups)) {
        const mainFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
        if (!mainFile) continue;

        // Check if we have all required components
        const hasRequiredFiles = REQUIRED_SHAPEFILE_EXTENSIONS.every(ext => 
          files.some(f => f.name.toLowerCase().endsWith(ext))
        );

        if (!hasRequiredFiles) {
          const missingExts = REQUIRED_SHAPEFILE_EXTENSIONS.filter(ext => 
            !files.some(f => f.name.toLowerCase().endsWith(ext))
          );
          
          toast({
            title: 'Missing Files',
            description: `Shapefile "${baseName}" is missing required components: ${missingExts.join(', ')}`,
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
          
          setUploadProgress((prev) => prev + (100 / files.length));
        }

        // Notify completion with all related files
        onUploadComplete?.({
          name: mainFile.name,
          size: totalSize,
          type: 'application/x-shapefile',
          relatedFiles
        });
      }

      // Handle non-shapefile uploads
      const regularFiles = selectedFiles.filter(file => {
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
        setUploadProgress((prev) => prev + (100 / regularFiles.length));
      }

      toast({
        title: 'Success',
        description: 'All files uploaded successfully',
      });

      setSelectedFiles([]);
      setUploadProgress(0);
      setShowUploadDialog(false);
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
        accept=".shp,.shx,.dbf,.prj,.txt,.csv,.xyz,.dxf"
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
                  <span className="text-sm text-muted-foreground">(Shapefile)</span>
                </div>
                
                {!validationStatus[baseName] && (
                  <Alert className="mb-2 border-yellow-500 text-yellow-700">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription>
                      Missing required files. A shapefile needs .shp, .shx, and .dbf files in the same directory.
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="pl-7 space-y-2 text-sm text-muted-foreground">
                  {files.map(file => (
                    <div key={file.name} className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4" />
                      <span className="font-mono">{file.name}</span>
                      <span className="text-xs">({Math.round(file.size / 1024)} KB)</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {selectedFiles.length > 0 && !Object.keys(fileGroups).length && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileIcon className="h-5 w-5" />
                  <h3 className="font-medium">{selectedFiles[0].name}</h3>
                </div>
                <div className="pl-7 text-sm text-muted-foreground">
                  <span>({Math.round(selectedFiles[0].size / 1024)} KB)</span>
                </div>
              </div>
            )}
            
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
              disabled={
                selectedFiles.length === 0 || 
                uploadProgress > 0 || 
                (Object.keys(fileGroups).length > 0 && Object.values(validationStatus).some(status => !status))
              }
            >
              Upload Files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

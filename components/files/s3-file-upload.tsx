'use client';

import { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { getSignedUploadUrl } from 'utils/supabase/s3';
import { Progress } from '../ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { Upload, AlertCircle, CheckCircle2, FileIcon } from 'lucide-react';

import { UploadedFile, RelatedFile } from './types';

// Define custom attributes for directory-aware file input
interface DirectoryAttributes {
  webkitdirectory: string;
  directory: string;
}

// Extend input element props with directory attributes
type DirectoryInputProps = React.InputHTMLAttributes<HTMLInputElement> & Partial<DirectoryAttributes>;

interface S3FileUploadProps {
  projectId: string;
  onUploadComplete?: (file: UploadedFile) => void;
}

import { FILE_TYPE_CONFIGS, getFileTypeConfig, validateCompanionFiles } from '../geo-loader/core/file-type-config';

export function S3FileUpload({ projectId, onUploadComplete }: S3FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  interface FileGroup {
    mainFile: File;
    companions: File[];
  }

  interface ValidationResult {
    valid: boolean;
    message?: string;
  }

  const [fileGroups, setFileGroups] = useState<{ [key: string]: FileGroup }>({});
  const [validationStatus, setValidationStatus] = useState<{ [key: string]: ValidationResult }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

interface FileSystemFileHandle {
  kind: 'file';
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandle {
  kind: 'directory';
  values(): AsyncIterableIterator<FileSystemFileHandle>;
}

const findCompanionFiles = async (mainFile: File, files: File[]): Promise<File[]> => {
  const companions: File[] = [];
  const baseName = mainFile.name.substring(0, mainFile.name.lastIndexOf('.')).toLowerCase();
  const config = getFileTypeConfig(mainFile.name);
  
  if (!config) return companions;

  // Look for companion files in the provided files array
  files.forEach(file => {
    const fileBaseName = file.name.substring(0, file.name.lastIndexOf('.')).toLowerCase();
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (fileBaseName === baseName && 
        config.companionFiles.some(comp => comp.extension === ext) &&
        file !== mainFile) {
      companions.push(file);
    }
  });
  
  return companions;
};

const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
  if (!event.target.files || event.target.files.length === 0) return;

  const files = Array.from(event.target.files);
    
    // Group files by directory and base name
    const fileGroups: { [key: string]: { mainFile: File; companions: File[] } } = {};
    const validationResults: { [key: string]: { valid: boolean; message?: string } } = {};
    let selectedFilesList: File[] = [];

  // First pass: Group files by base name and scan for companions
  for (const file of files) {
    const pathParts = file.webkitRelativePath.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const baseName = fileName.substring(0, fileName.lastIndexOf('.')).toLowerCase();
    const dirPath = pathParts.slice(0, -1).join('/');
    const key = `${dirPath}/${baseName}`;
    const config = getFileTypeConfig(fileName);

    if (config) {
      // This is a main file that might have companions
      if (!fileGroups[key]) {
        const companions = await findCompanionFiles(file, files);
        fileGroups[key] = { mainFile: file, companions };
      } else if (file.name.toLowerCase().endsWith(config.mainExtension)) {
        fileGroups[key].mainFile = file;
      } else {
        fileGroups[key].companions.push(file);
      }
    } else {
      // This might be a companion file
      if (fileGroups[key]) {
        fileGroups[key].companions.push(file);
      } else {
        // Standalone file
        selectedFilesList.push(file);
      }
    }
  }

    // Second pass: Validate file groups
    for (const [key, group] of Object.entries(fileGroups)) {
      const config = getFileTypeConfig(group.mainFile.name);
      if (config) {
        const validation = validateCompanionFiles(group.mainFile, group.companions);
        validationResults[key] = {
          valid: validation.valid,
          message: validation.message
        };

        if (!validation.valid && validation.message) {
          toast({
            title: 'Missing Required Files',
            description: validation.message,
            variant: 'destructive',
          });
        }

        selectedFilesList = selectedFilesList.concat([group.mainFile, ...group.companions]);
      } else {
        selectedFilesList.push(group.mainFile);
      }
    }

    setSelectedFiles(selectedFilesList);
    setFileGroups(fileGroups);
    setValidationStatus(validationResults);
    
    setShowUploadDialog(true);
  };

  const uploadFile = async (file: File, progressCallback?: (progress: number) => void): Promise<string> => {
    const signedUrl = await getSignedUploadUrl(file.name, projectId);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && progressCallback) {
          const progress = (event.loaded / event.total) * 100;
          progressCallback(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(signedUrl.split('?')[0]); // Return the base URL without query params
        } else {
          reject(new Error(`Failed to upload ${file.name} (Status: ${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error(`Network error uploading ${file.name}`));
      
      try {
        xhr.send(file);
      } catch (error) {
        reject(new Error(`Failed to send ${file.name}: ${error instanceof Error ? error.message : String(error)}`));
      }
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
      // Handle file groups with companions
      for (const [baseName, group] of Object.entries(fileGroups)) {
        const config = getFileTypeConfig(group.mainFile.name);
        if (!config) continue;

        const validation = validateCompanionFiles(group.mainFile, group.companions);
        if (!validation.valid) {
          toast({
            title: 'Missing Required Files',
            description: validation.message || `Missing required companion files for ${baseName}`,
            variant: 'destructive',
          });
          continue;
        }

        // Calculate total size and progress increment per file
        const totalSize = [group.mainFile, ...group.companions].reduce((sum, file) => sum + file.size, 0);
        const totalFiles = group.companions.length + 1;
        const progressPerFile = 100 / totalFiles;

        // Upload main file and companions
        const relatedFiles: { [key: string]: RelatedFile } = {};
        let mainFileUrl = '';

        try {
          // Upload main file first
          mainFileUrl = await uploadFile(group.mainFile, (fileProgress) => {
            const fileContribution = (fileProgress / 100) * progressPerFile;
            setUploadProgress(fileContribution);
          });

          // Upload companion files
          for (const file of group.companions) {
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            const uploadedUrl = await uploadFile(file, (fileProgress) => {
              const fileContribution = (fileProgress / 100) * progressPerFile;
              setUploadProgress(prev => {
                const baseProgress = Math.floor(prev / progressPerFile) * progressPerFile;
                return baseProgress + fileContribution;
              });
            });

            relatedFiles[ext] = {
              path: uploadedUrl,
              size: file.size,
              name: file.name
            };
          }

          // Notify completion with all related files
          onUploadComplete?.({
            name: group.mainFile.name,
            size: totalSize,
            type: config.description,
            relatedFiles
          });
        } catch (error) {
          console.error(`Error uploading files for ${baseName}:`, error);
          throw new Error(`Failed to upload files for ${baseName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Handle standalone files
      const regularFiles = selectedFiles.filter(file => !Object.values(fileGroups).some(group => 
        group.mainFile === file || group.companions.includes(file)
      ));

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
        description: Object.keys(fileGroups).length > 0 
          ? 'Shapefile and all companion files uploaded successfully. Click the Import button to process the data.'
          : 'File uploaded successfully',
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
      <div className="flex gap-2">
        <input 
          ref={fileInputRef}
          type="file" 
          accept={Object.values(FILE_TYPE_CONFIGS).reduce((acc, config) => {
            const exts = [
              config.mainExtension,
              ...config.companionFiles.map(comp => comp.extension)
            ].map(ext => ext.startsWith('.') ? ext : `.${ext}`); // Ensure dot prefix
            return acc + (acc ? ',' : '') + exts.join(',');
          }, '')}
          onChange={handleFileChange}
          multiple
          className="hidden"
        />
        <Button onClick={() => {
          if (fileInputRef.current) {
            fileInputRef.current.removeAttribute('webkitdirectory');
            fileInputRef.current.removeAttribute('directory');
            fileInputRef.current.click();
          }
        }}>
          <Upload className="mr-2 h-4 w-4" />
          Select Files
        </Button>
        <Button onClick={() => {
          if (fileInputRef.current) {
            fileInputRef.current.setAttribute('webkitdirectory', '');
            fileInputRef.current.setAttribute('directory', '');
            fileInputRef.current.click();
          }
        }} variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Select Directory
        </Button>
      </div>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            {Object.entries(fileGroups).map(([baseName, group]) => (
              <div key={baseName} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  {validationStatus[baseName]?.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  <h3 className="font-medium">{baseName}</h3>
                  <span className="text-sm text-muted-foreground">
                    ({getFileTypeConfig(group.mainFile.name)?.description || 'File'})
                  </span>
                </div>
                
                {!validationStatus[baseName]?.valid && (
                  <Alert className="mb-2 border-yellow-500 text-yellow-700">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription>
                      {validationStatus[baseName]?.message || 'Missing required companion files'}
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="pl-7 space-y-2 text-sm text-muted-foreground">
                  {[group.mainFile, ...group.companions].map(file => (
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
              <div className="space-y-2">
                {selectedFiles.map(file => (
                  <div key={file.name} className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4" />
                    <span className="font-mono text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({Math.round(file.size / 1024)} KB)</span>
                  </div>
                ))}
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
                (Object.keys(fileGroups).length > 0 && Object.values(validationStatus).some(status => !status?.valid))
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

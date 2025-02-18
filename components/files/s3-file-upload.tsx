'use client';

import { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { getSignedUploadUrl } from 'utils/supabase/s3';
import { Progress } from '../ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { Upload, AlertCircle, CheckCircle2, FileIcon } from 'lucide-react';
import { 
  FileTypeConfig,
  FILE_TYPE_CONFIGS, 
  getFileTypeConfig, 
  validateCompanionFiles, 
  getMimeType 
} from '@/components/shared/types/file-types';
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
  acceptedFileTypes?: string[];
  disabled?: boolean;
  maxFileSize?: number;  // in bytes
}

export function S3FileUpload({ projectId, onUploadComplete, acceptedFileTypes, disabled, maxFileSize }: S3FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  
  interface FileGroup {
    mainFile: File | null;  // Allow null for when companions are found before main file
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

  // Helper function to safely check companion files length
  const hasCompanionFiles = (config: FileTypeConfig | undefined): boolean => {
    return (config?.companionFiles?.length ?? 0) > 0;
  };

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
  
    console.log('Finding companion files for:', {
      mainFile: mainFile.name,
      baseName,
      availableFiles: files.map(f => f.name),
      companionExtensions: config.companionFiles.map(c => c.extension)
    });
  
    // Look for companion files in the provided files array
    files.forEach(file => {
      const fileBaseName = file.name.substring(0, file.name.lastIndexOf('.')).toLowerCase();
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      
      console.log('Checking file:', {
        file: file.name,
        fileBaseName,
        ext,
        isMatch: fileBaseName === baseName,
        isValidExt: config.companionFiles.some(comp => comp.extension === ext),
        isDifferentFile: file !== mainFile
      });
      
      if (fileBaseName === baseName && 
          config.companionFiles.some(comp => comp.extension === ext) &&
          file !== mainFile) {
        console.log('Found companion file:', file.name);
        companions.push(file);
      }
    });
    
    console.log('Found companion files:', companions.map(f => f.name));
    return companions;
  };
  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
  
      const files = Array.from(event.target.files);
      const fileGroups: { [key: string]: FileGroup } = {};
      const validationResults: { [key: string]: ValidationResult } = {};
      let selectedFilesList: File[] = [];
  
      // First pass: Group files by base name
      for (const file of files) {
        const fileName = file.name;
        const baseName = fileName.substring(0, fileName.lastIndexOf('.')).toLowerCase();
        const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
        const key = baseName;
  
        console.log('Processing file:', {
          fileName,
          baseName,
          extension: ext,
          key
        });
  
        // Initialize group if it doesn't exist
        if (!fileGroups[key]) {
          fileGroups[key] = { mainFile: null, companions: [] };
        }
  
        // Get file type config first
        const config = getFileTypeConfig(fileName);
        console.log('File type config:', {
          fileName,
          ext,
          config: config ? {
            mainExtension: config.mainExtension,
            companionFiles: config.companionFiles.map(c => c.extension)
          } : null
        });

        // Handle shapefile and its companions
        if (ext === '.shp') {
          console.log('Found shapefile:', fileName);
          fileGroups[key].mainFile = file;
        } else if (['.shx', '.dbf', '.prj'].includes(ext)) {
          console.log('Found shapefile companion:', fileName);
          fileGroups[key].companions.push(file);
        } else if (config?.mainExtension === ext) {
          // This is a main file of another type
          console.log('Found main file:', fileName);
          fileGroups[key].mainFile = file;
        } else if (config?.companionFiles.some(comp => comp.extension === ext)) {
          // This is a companion file of another type
          console.log('Found companion file:', fileName);
          fileGroups[key].companions.push(file);
        } else {
          console.log('Adding standalone file:', fileName);
          selectedFilesList.push(file);
        }
      }
  
      // Second pass: Validate groups and prepare final file list
      for (const [key, group] of Object.entries(fileGroups)) {
        // Skip groups without a main file
        if (!group.mainFile) {
          console.log(`Skipping group ${key} - no main file found`);
          // Add companions to standalone files if no main file was found
          selectedFilesList = selectedFilesList.concat(group.companions);
          continue;
        }
  
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
          // Skip groups without a main file
          if (!group.mainFile) {
            console.log(`Skipping upload for group ${baseName} - no main file`);
            continue;
          }
  
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

          // Ensure extension starts with a dot for consistency
          const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
          const storagePath = `${projectId}/${file.name}`;
          console.log('Adding companion file to relatedFiles:', {
            file: file.name,
            ext: normalizedExt,
            path: storagePath
          });

          relatedFiles[normalizedExt] = {
            path: storagePath,
            size: file.size,
            name: file.name
          };
            }

            console.log('Final relatedFiles structure:', relatedFiles);
  
            // Get and verify MIME type
            const mimeType = getMimeType(group.mainFile.name);
            console.log('Determined MIME type:', {
              fileName: group.mainFile.name,
              mimeType: mimeType
            });
  
            // Notify completion with all related files
            onUploadComplete?.({
              id: mainFileUrl.split('/').pop() || '',
              name: group.mainFile.name,
              size: totalSize,
              type: mimeType,
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
          const uploadedUrl = await uploadFile(file);
          const mimeType = getMimeType(file.name);
          console.log('Determined MIME type for standalone file:', {
            fileName: file.name,
            mimeType: mimeType
          });
          onUploadComplete?.({
            id: uploadedUrl.split('/').pop() || '',
            name: file.name,
            size: file.size,
            type: mimeType
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
            ].map(ext => ext.startsWith('.') ? ext : `.${ext}`);
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
            {Object.entries(fileGroups).map(([baseName, group]) => {
              // Only render groups with a main file
              if (!group.mainFile) return null;

              const config = getFileTypeConfig(group.mainFile.name);
              const description = config?.description || 'File';
              const requiredFiles = config?.companionFiles
                ?.filter(comp => comp.required)
                ?.map(comp => comp.extension)
                ?.join(', ');

              return (
                <div key={baseName} className="mb-4">
                  <div className="mb-4 p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      {validationStatus[baseName]?.valid ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                      )}
                      <h3 className="font-medium">{baseName}</h3>
                      <span className="text-sm text-muted-foreground">
                        ({description})
                      </span>
                    </div>
                    
                    {hasCompanionFiles(config) && (
                      <div className="text-xs text-muted-foreground mb-2">
                        Required files: {requiredFiles || 'None'}
                      </div>
                    )}
                  </div>
                  
                  {!validationStatus[baseName]?.valid && (
                    <Alert className="mb-2 border-yellow-500 text-yellow-700">
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                      <AlertDescription>
                        {validationStatus[baseName]?.message || 'Missing required companion files'}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="pl-7 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-primary">
                      <FileIcon className="h-4 w-4" />
                      <span className="font-mono font-medium">{group.mainFile.name}</span>
                      <span className="text-xs text-muted-foreground">({Math.round(group.mainFile.size / 1024)} KB)</span>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Main File</span>
                    </div>
                    
                    {group.companions.map(file => {
                      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                      const companionInfo = config?.companionFiles.find(comp => comp.extension === ext);
                      
                      return (
                        <div key={file.name} className="flex items-center gap-2 text-muted-foreground">
                          <FileIcon className="h-4 w-4" />
                          <span className="font-mono">{file.name}</span>
                          <span className="text-xs">({Math.round(file.size / 1024)} KB)</span>
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            {companionInfo?.description || 'Companion File'}
                            {companionInfo?.required && ' (Required)'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            
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

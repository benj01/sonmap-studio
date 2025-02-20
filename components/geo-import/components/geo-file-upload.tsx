'use client';

import { useState, useCallback } from 'react';
import { S3FileUpload } from '@/components/files/components/upload';
import { useGeoImport } from '../hooks/use-geo-import';
import type { UploadedFile } from '@/components/files/types';
import type { ImportSession } from '@/types/geo-import';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { 
  FILE_TYPE_CONFIGS, 
  validateCompanionFiles, 
  GeoFileValidationSchema 
} from '@/components/shared/types/file-types';

interface GeoFileUploadProps {
  projectId: string;
  onImportSessionCreated?: (session: ImportSession) => void;
  maxFileSize?: number;
}

interface RelatedFile {
  name: string;
  size: number;
}

/**
 * Component for handling geodata file uploads
 * Integrates with S3FileUpload component and initializes the import session
 */
export function GeoFileUpload({ 
  projectId, 
  onImportSessionCreated,
  maxFileSize
}: GeoFileUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { createImportSession } = useGeoImport();

  const handleValidation = useCallback((file: UploadedFile): boolean => {
    try {
      // Get file extension
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const fileType = ext.substring(1); // Remove the dot

      // Validate using Zod schema
      const validation = GeoFileValidationSchema.safeParse({
        type: fileType,
        size: file.size,
        companionFiles: file.relatedFiles ? 
          Object.entries(file.relatedFiles).map(([ext, f]: [string, RelatedFile]) => ({
            type: ext.substring(1),
            size: f.size,
            required: FILE_TYPE_CONFIGS[fileType]?.companionFiles
              .find(c => c.extension === ext)?.required ?? false
          })) : undefined
      });

      if (!validation.success) {
        setError(validation.error.errors[0].message);
        return false;
      }

      // Additional validation for companion files if needed
      if (file.relatedFiles) {
        const mainFile = new File([], file.name, { type: file.type });
        const companions = Object.entries(file.relatedFiles).map(([_, f]: [string, RelatedFile]) => 
          new File([], f.name, { type: 'application/octet-stream' })
        );

        const companionValidation = validateCompanionFiles(mainFile, companions);
        if (!companionValidation.valid) {
          setError(companionValidation.message || 'Invalid companion files');
          return false;
        }
      }

      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Validation failed');
      return false;
    }
  }, []);

  const handleUploadComplete = async (file: UploadedFile) => {
    setError(null);
    setIsProcessing(true);

    try {
      // Validate the uploaded file
      if (!handleValidation(file)) {
        return;
      }

      const session = await createImportSession({
        fileId: file.id,
        fileName: file.name,
        fileType: file.type,
      });
      
      onImportSessionCreated?.(session);
    } catch (error) {
      console.error('Failed to create import session:', error);
      setError(error instanceof Error ? error.message : 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  };

  // Get accepted file types from FILE_TYPE_CONFIGS
  const acceptedFileTypes = Object.values(FILE_TYPE_CONFIGS).reduce((acc, config) => {
    // Add main extension
    acc.push(config.mainExtension);
    // Add companion file extensions
    config.companionFiles.forEach(comp => {
      if (!acc.includes(comp.extension)) {
        acc.push(comp.extension);
      }
    });
    return acc;
  }, [] as string[]);

  return (
    <div className="w-full space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <S3FileUpload
        projectId={projectId}
        onUploadComplete={handleUploadComplete}
        acceptedFileTypes={acceptedFileTypes}
        disabled={isProcessing}
        maxFileSize={maxFileSize}
      />

      {isProcessing && (
        <div className="text-sm text-muted-foreground">
          Creating import session...
        </div>
      )}
    </div>
  );
} 
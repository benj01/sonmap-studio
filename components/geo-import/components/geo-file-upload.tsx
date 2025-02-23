'use client';

import { useState, useEffect } from 'react';
import { useGeoImport } from '../hooks/use-geo-import';
import type { ImportSession, FullDataset } from '@/types/geo-import';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ShapefileParser } from '@/core/processors/shapefile-parser';
import { generatePreview } from '@/core/processors/preview-generator';
import { createClient } from '@/utils/supabase/client';
import { Progress } from '@/components/ui/progress';

interface GeoFileUploadProps {
  projectId: string;
  fileInfo?: {
    id: string;
    name: string;
    size: number;
    type: string;
  };
  onImportSessionCreated?: (session: ImportSession) => void;
}

interface CompanionFile {
  id: string;
  extension: string;
}

/**
 * Component for handling geodata file parsing and import session creation
 */
export function GeoFileUpload({ 
  projectId,
  fileInfo,
  onImportSessionCreated
}: GeoFileUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const { createImportSession } = useGeoImport();
  const supabase = createClient();

  const downloadFile = async (fileId: string): Promise<ArrayBuffer> => {
    const { data, error } = await supabase
      .storage
      .from('project-files')
      .download(`${projectId}/${fileId}`);
    
    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    return await data.arrayBuffer();
  };

  const findCompanionFiles = async (baseName: string): Promise<CompanionFile[]> => {
    const companions: CompanionFile[] = [];
    const extensions = ['.dbf', '.shx', '.prj'];

    // List files in the project directory
    const { data: files, error } = await supabase
      .storage
      .from('project-files')
      .list(projectId);

    if (error) {
      console.warn('Failed to list files:', error);
      return companions;
    }

    // Find companion files with matching base name
    for (const file of files) {
      for (const ext of extensions) {
        if (file.name === baseName + ext) {
          companions.push({
            id: file.id,
            extension: ext
          });
          break;
        }
      }
    }

    return companions;
  };

  const handleParseFile = async () => {
    if (!fileInfo?.id) return;

    setError(null);
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Starting file processing...');

    try {
      // Get base name for finding companion files
      const baseName = fileInfo.name.replace(/\.shp$/, '');
      
      // Download main file
      setProgressMessage('Downloading main file...');
      const mainFileData = await downloadFile(fileInfo.id);

      // Find and download companion files
      setProgressMessage('Looking for companion files...');
      const companionFiles = await findCompanionFiles(baseName);
      
      // Download companion files
      const companions: Record<string, ArrayBuffer> = {};
      for (const companion of companionFiles) {
        setProgressMessage(`Downloading ${companion.extension} file...`);
        companions[companion.extension] = await downloadFile(companion.id);
      }

      setProgressMessage('Creating parser...');
      // Create a parser instance
      const parser = new ShapefileParser();

      // Parse the file
      const fullDataset = await parser.parse(mainFileData, companions, {
        maxFeatures: 10000 // Increased limit for full dataset
      }, (event) => {
        setProgress(event.progress * 0.7); // 70% for parsing
        if (event.message) {
          setProgressMessage(event.message);
        }
      });

      // Generate preview dataset
      setProgressMessage('Generating preview...');
      setProgress(75);
      const previewDataset = generatePreview(fullDataset, {
        maxFeatures: 500,
        simplificationTolerance: 0.00001,
        randomSampling: true
      });
      setProgress(85);

      // Create import session
      setProgressMessage('Creating import session...');
      const session = await createImportSession({
        fileId: fileInfo.id,
        fileName: fileInfo.name,
        fileType: fileInfo.type,
        fullDataset,
        previewDataset
      });
      setProgress(100);

      onImportSessionCreated?.(session);
    } catch (error) {
      console.error('Failed to parse file:', error);
      setError(error instanceof Error ? error.message : 'Failed to parse file');
    } finally {
      setIsProcessing(false);
    }
  };

  // Start parsing when component mounts
  useEffect(() => {
    handleParseFile();
  }, [fileInfo?.id]);

  return (
    <div className="w-full space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{progressMessage}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}
    </div>
  );
} 
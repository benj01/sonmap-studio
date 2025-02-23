'use client';

import { useState, useEffect } from 'react';
import { useGeoImport } from '../hooks/use-geo-import';
import type { ImportSession } from '@/types/geo-import';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { ShapefileParser } from '@/core/processors/shapefile-parser';
import { createClient } from '@/utils/supabase/client';

interface GeoFileUploadProps {
  projectId: string;
  fileInfo: {
    id: string;
    name: string;
    size: number;
    type: string;
  };
  onImportSessionCreated?: (session: ImportSession) => void;
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

  const handleParseFile = async () => {
    setError(null);
    setIsProcessing(true);

    try {
      // Download the file from Supabase storage
      const fileData = await downloadFile(fileInfo.id);

      // Create a parser instance
      const parser = new ShapefileParser();

      // Parse the file
      const fullDataset = await parser.parse(fileData, undefined, {
        maxFeatures: 1000 // Limit for initial testing
      }, (event) => {
        console.log('Parse progress:', event);
      });

      // Create import session
      const session = await createImportSession({
        fileId: fileInfo.id,
        fileName: fileInfo.name,
        fileType: fileInfo.type,
        fullDataset
      });

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
  }, [fileInfo.id]);

  return (
    <div className="w-full space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {isProcessing && (
        <div className="text-sm text-muted-foreground">
          Parsing file and creating import session...
        </div>
      )}
    </div>
  );
} 
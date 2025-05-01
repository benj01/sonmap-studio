'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Trash } from 'lucide-react';
import { GeoFileUpload } from './geo-file-upload';
import { MapPreview } from './map-preview';
import { FileInfoCard } from './file-info-card';
import { ImportDetailsCard } from './import-details-card';
import { LogLevel, LogManager } from '@/core/logging/log-manager';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { GeoImportDialogProps, ImportSession } from '../types';
import { FullDataset } from '@/types/geo-import';
import { logger } from '@/utils/logger';
import { useGeoImport } from '../hooks/use-geo-import';
import { useWizard } from '../wizard/WizardContext';

const SOURCE = 'GeoImportDialog';
const supabase = createClient();

// Configure logger to output to console and set debug level
logger.setComponentLogLevel(SOURCE, LogLevel.DEBUG);

// Create a safe logger that won't throw if any parameters are missing
const safeLogger = {
  debug: (message: string, data?: any) => {
    try {
      logger.debug(SOURCE, message, data);
    } catch (error) {
      console.error('Error logging debug message:', error);
    }
  },
  info: (message: string, data?: any) => {
    try {
      logger.info(SOURCE, message, data);
    } catch (error) {
      console.error('Error logging info message:', error);
    }
  },
  warn: (message: string, data?: any) => {
    try {
      logger.warn(SOURCE, message, data);
    } catch (error) {
      console.error('Error logging warning message:', error);
    }
  },
  error: (message: string, data?: any) => {
    try {
      logger.error(SOURCE, message, data);
    } catch (error) {
      console.error('Error logging error message:', error);
    }
  }
};

// Add a safe JSON stringify utility
const safeStringify = (obj: any): string => {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return '[Unserializable Object]';
  }
};

// DEPRECATED: This is the legacy import dialog. Please use the wizard-based import flow instead. This component is kept for reference and should not be used for new imports.

export function GeoImportDialog({
  projectId,
  open,
  onOpenChange,
  onImportComplete,
  fileInfo
}: GeoImportDialogProps) {
  safeLogger.info('GeoImportDialog component loaded');
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSession, setImportSession] = useState<ImportSession | null>(null);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<number[]>([]);
  const [processedFiles] = useState(() => new Set<string>());
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentImportLogId, setCurrentImportLogId] = useState<string | null>(null);
  const { /* generatePreview, */ ...geoImportRest } = useGeoImport();
  const {
    fileInfo: wizardFileInfo,
    dataset,
    selectedFeatureIds: wizardSelectedFeatureIds,
    targetSrid
  } = useWizard();

  // Set log level for this component to DEBUG for detailed logs
  LogManager.getInstance().setComponentLogLevel('GeoImportDialog', LogLevel.DEBUG);

  const memoizedFileInfo = useMemo(() => 
    wizardFileInfo ? {
      id: wizardFileInfo.id,
      name: wizardFileInfo.name,
      size: wizardFileInfo.size,
      type: wizardFileInfo.type
    } : undefined
  , [wizardFileInfo?.id, wizardFileInfo?.name, wizardFileInfo?.size, wizardFileInfo?.type]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setImportSession(null);
      setSelectedFeatureIds([]);
      setCurrentImportLogId(null);
      setProgress(0);
      setProgressMessage('');
    }
  }, [open]);

  // Add timeout handling
  useEffect(() => {
    if (!isProcessing) return;

    const timeoutDuration = 5 * 60 * 1000; // 5 minutes
    const timeoutId = setTimeout(() => {
      if (isProcessing) {
        safeLogger.error('Import timeout reached', { importLogId: currentImportLogId });
        toast({
          title: 'Import Timeout',
          description: 'The import is taking longer than expected. Please check the import logs for status.',
          variant: 'destructive',
          duration: 5000,
        });
        setIsProcessing(false);
        onOpenChange(false);
      }
    }, timeoutDuration);

    return () => clearTimeout(timeoutId);
  }, [isProcessing, currentImportLogId, toast, onOpenChange]);

  const handleImportSessionCreated = async (session: ImportSession) => {
    safeLogger.debug('Import session received by dialog', {
      fileId: session.fileId,
      status: session.status,
      featureCount: session.fullDataset?.features.length || 0,
      geometryTypes: session.fullDataset?.metadata?.geometryTypes || [],
      sourceSrid: session.fullDataset?.metadata?.srid,
      bounds: session.fullDataset?.metadata?.bounds
    });

    // Check if the necessary data exists from the parser
    if (session.fullDataset && session.fullDataset.features?.length > 0) {
      setImportSession(session);
      // Select all features initially (by id)
      const allFeatureIds = session.fullDataset.features.map(f => f.id);
      setSelectedFeatureIds(allFeatureIds);
      if (memoizedFileInfo?.name) {
        processedFiles.add(memoizedFileInfo.name);
      }
      safeLogger.info('Selected all features', { count: allFeatureIds.length });
    } else {
      // Handle cases where parsing might have failed or returned no features
      safeLogger.warn('Import session created but lacks fullDataset or features needed for preview generation');
      setImportSession(session);
    }
  };

  // Accepts either an array or a function updater
  const handleFeaturesSelected = (featureIdsOrUpdater: number[] | ((prev: number[]) => number[])) => {
    setSelectedFeatureIds(prev =>
      typeof featureIdsOrUpdater === 'function'
        ? featureIdsOrUpdater(prev)
        : featureIdsOrUpdater
    );
  };

  const handleImport = async () => {
    if (!importSession?.fullDataset) {
      safeLogger.error('No import session or dataset available');
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);
      setProgressMessage('Preparing import...');
      
      // Use id for selection
      const selectedFeatures = importSession.fullDataset.features.filter(f => 
        selectedFeatureIds.includes(f.id)
      );

      setProgressMessage(`Importing ${selectedFeatures.length} features...`);
      
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Prepare the request payload
      const payload = {
        projectFileId: importSession.fileId,
        collectionName: importSession.fullDataset?.sourceFile || 'Imported Features',
        features: importSession.fullDataset?.features || [],
        sourceSrid: importSession.fullDataset?.metadata?.srid || 2056,
        targetSrid: 4326,
        batchSize: 100
      };

      // Log the full payload
      LogManager.getInstance().info('GeoImportDialog', 'handleImport: requestPayload', payload);

      // Make a single API call instead of streaming
      const response = await fetch('/api/geo-import/stream', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(300000) // 5 minute timeout
      });

      // Log the backend response
      const backendResponse = await response.clone().json().catch(() => null);
      LogManager.getInstance().info('GeoImportDialog', 'handleImport: backend response', {
        status: response.status,
        response: backendResponse
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        safeLogger.error('Import API error response', { 
          status: response.status, 
          statusText: response.statusText,
          errorData 
        });
        throw new Error(
          errorData?.error || errorData?.message || `HTTP error! status: ${response.status}`
        );
      }

      // Parse the response
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Import failed with unknown error');
      }

      // Set the current import log ID for potential error handling
      setCurrentImportLogId(result.importLogId);
      
      // Show 100% progress
      setProgress(100);
      setProgressMessage(`Imported ${result.result.imported_count} features`);

      // Handle successful import
      safeLogger.info('Import completed successfully', {
        importLogId: result.importLogId,
        importedCount: result.result.imported_count,
        failedCount: result.result.failed_count,
        collectionId: result.result.collection_id,
        layerId: result.result.layer_id
      });

      // Call the completion handler
      onImportComplete({
        features: [],
        bounds: {
          minX: 0, minY: 0, maxX: 0, maxY: 0
        },
        layers: [],
        statistics: {
          pointCount: 0,
          layerCount: 0,
          featureTypes: {}
        },
        collectionId: result.result.collection_id,
        layerId: result.result.layer_id,
        totalImported: result.result.imported_count,
        totalFailed: result.result.failed_count
      });

      // Show success toast
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${result.result.imported_count} features`,
        duration: 5000,
      });

      // Close the dialog
      onOpenChange(false);

    } catch (error) {
      safeLogger.error('Import failed', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : String(error),
        importLogId: currentImportLogId
      });
      handleImportError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportError = async (error: unknown) => {
    // Simple error message extraction
    let errorMessage = "An unknown error occurred during import";
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    console.error('Import error:', error);
    
    // Update import log if available
    if (currentImportLogId) {
      try {
        await supabase
          .from('realtime_import_logs')
          .update({
            status: 'failed',
            metadata: {
              error: errorMessage,
              timestamp: new Date().toISOString()
            }
          })
          .eq('id', currentImportLogId);
      } catch (updateError) {
        console.error('Failed to update import log:', updateError);
      }
    }
    
    // Simple toast with the error message
    toast({
      title: 'Import Failed',
      description: errorMessage,
      variant: 'destructive'
    });

    setIsProcessing(false);
    onOpenChange(false);
  };

  const handleDownloadLogs = () => {
    const logManager = LogManager.getInstance();
    const logs = logManager.getLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-logs.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    const logManager = LogManager.getInstance();
    logManager.clearLogs();
    toast({
      title: 'Logs cleared',
      description: 'All logs have been cleared from memory.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full">
        <div style={{background:'#fee2e2',color:'#991b1b',padding:'4px',fontWeight:'bold'}}>LEGACY DIALOG ACTIVE</div>
        <DialogHeader className="pb-2">
          <DialogTitle>Import Geodata</DialogTitle>
          <DialogDescription>
            Import your geodata file into the project for visualization and analysis.
            {importSession?.fullDataset && (
              <span className="block mt-1 text-xs">
                Click features on the map to select/deselect them for import.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-3 py-2 overflow-y-auto pr-2">
          {fileInfo ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FileInfoCard
                  name={fileInfo.name}
                  size={fileInfo.size}
                  type={fileInfo.type}
                />
                <div className="flex items-center">
                  <GeoFileUpload
                    projectId={projectId}
                    fileInfo={fileInfo}
                    onImportSessionCreated={handleImportSessionCreated}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center p-4">
              No file selected for import
            </div>
          )}

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Preview</CardTitle>
              <CardDescription className="text-xs">
                Preview of the geodata to be imported
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {importSession?.fullDataset ? (
                <MapPreview
                  features={importSession.fullDataset?.features || []}
                  bounds={importSession.fullDataset?.metadata?.bounds}
                  selectedFeatureIds={selectedFeatureIds}
                  onFeaturesSelected={handleFeaturesSelected}
                />
              ) : (
                <div className="h-[200px] w-full bg-muted rounded-md flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    {isProcessing ? 'Loading preview...' : 'No data to preview'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {importSession && (
            <ImportDetailsCard
              importSession={importSession}
              selectedFeatureIds={selectedFeatureIds}
            />
          )}
        </div>

        <DialogFooter className="flex justify-between items-center mt-auto pt-3 border-t">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLogs}
              className="flex items-center gap-1 text-xs h-8"
            >
              <Download className="h-3 w-3" />
              Logs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLogs}
              className="flex items-center gap-1 text-xs h-8"
            >
              <Trash className="h-3 w-3" />
              Clear
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
              className="h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={!importSession?.fullDataset || !selectedFeatureIds.length || isProcessing}
              className="h-8"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  {progressMessage || 'Importing...'}
                </>
              ) : (
                <>Import Selected Features</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 
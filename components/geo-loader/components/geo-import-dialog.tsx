import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/ui/dialog'
import { Button } from 'components/ui/button'
import { ScrollArea } from 'components/ui/scroll-area'
import { Alert, AlertDescription } from 'components/ui/alert'
import GeoLoader from '../index'
import { LoaderResult } from 'types/geo'
import { Info, AlertTriangle } from 'lucide-react'
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems'

interface GeoImportDialogProps {
  isOpen: boolean
  onClose: () => void
  file: File | null
  onImportComplete: (result: LoaderResult) => void
}

interface LogEntry {
  message: string
  type: 'info' | 'warning' | 'error'
  timestamp: Date
}

export function GeoImportDialog({
  isOpen,
  onClose,
  file,
  onImportComplete,
}: GeoImportDialogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hasErrors, setHasErrors] = useState(false)

  const addLogs = (newLogs: { message: string; type: LogEntry['type'] }[]) => {
    const timestamp = new Date();
    setLogs(prev => [
      ...prev,
      ...newLogs.map(log => ({
        ...log,
        timestamp
      }))
    ]);
    
    // Only set hasErrors if there are error type logs
    if (newLogs.some(log => log.type === 'error')) {
      setHasErrors(true);
    }
  };

  const handleLogsUpdate = (messages: string[]) => {
    const newLogs = messages.map(message => ({
      message,
      type: message.toLowerCase().includes('error') ? 'error' as const :
            message.toLowerCase().includes('warn') ? 'warning' as const : 
            'info' as const
    }));
    addLogs(newLogs);
  };

  const handleImportComplete = (result: LoaderResult) => {
    const importLogs = [];

    // Log coordinate system information
    if (result.coordinateSystem) {
      if (result.coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        importLogs.push({
          message: `Transformed coordinates from ${result.coordinateSystem} to ${COORDINATE_SYSTEMS.WGS84}`,
          type: 'info' as const
        });
      } else {
        importLogs.push({
          message: `Using coordinate system: ${result.coordinateSystem}`,
          type: 'info' as const
        });
      }
    }

    // Log feature statistics
    if (result.statistics) {
      importLogs.push({
        message: `Imported ${result.statistics.pointCount} features`,
        type: 'info' as const
      });
      
      if (result.statistics.layerCount) {
        importLogs.push({
          message: `Found ${result.statistics.layerCount} layers`,
          type: 'info' as const
        });
      }
      
      // Log feature types
      Object.entries(result.statistics.featureTypes).forEach(([type, count]) => {
        importLogs.push({
          message: `- ${count} ${type} features`,
          type: 'info' as const
        });
      });

      // Log transformation failures if any
      if (result.statistics.failedTransformations) {
        const failureCount = result.statistics.failedTransformations;
        importLogs.push({
          message: `Warning: ${failureCount} feature${failureCount > 1 ? 's' : ''} failed coordinate transformation`,
          type: 'warning' as const
        });
      }

      // Log detailed errors if available
      if (result.statistics.errors) {
        result.statistics.errors.forEach(error => {
          const message = error.message ? 
            `${error.type}: ${error.message} (${error.count} occurrence${error.count > 1 ? 's' : ''})` :
            `${error.type}: ${error.count} occurrence${error.count > 1 ? 's' : ''}`;
          importLogs.push({
            message,
            type: 'error' as const
          });
        });
      }
    }

    // Check for transformation errors in feature properties
    const transformErrors = result.features.filter(f => f.properties?._transformError);
    if (transformErrors.length > 0) {
      const uniqueErrors = new Set(transformErrors.map(f => f.properties._transformError));
      uniqueErrors.forEach(error => {
        const count = transformErrors.filter(f => f.properties._transformError === error).length;
        importLogs.push({
          message: `Warning: ${error} (${count} features affected)`,
          type: 'warning' as const
        });
      });
    }

    // Check for parser errors in feature properties
    const parserErrors = result.features.filter(f => f.properties?._errors);
    if (parserErrors.length > 0) {
      const errorCount = parserErrors.reduce((sum, f) => 
        sum + (Array.isArray(f.properties._errors) ? f.properties._errors.length : 1), 0
      );
      importLogs.push({
        message: `Warning: ${errorCount} parsing errors occurred in ${parserErrors.length} features`,
        type: 'warning' as const
      });
    }

    // Batch update all logs at once
    addLogs(importLogs);

    onImportComplete(result);
    // Don't close dialog if there are errors or warnings that need attention
    if (!hasErrors && !result.statistics?.failedTransformations) {
      onClose();
    }
  };

  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Import Geometry File</DialogTitle>
          <div className="flex items-center gap-2">
            {hasErrors && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Errors occurred during import. Check logs below for more information.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          <GeoLoader
            file={file}
            onLoad={handleImportComplete}
            onCancel={onClose}
            onLogsUpdate={handleLogsUpdate}
          />

          {/* Logs section */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Import Logs</h4>
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                {hasErrors && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLogs([]);
                      setHasErrors(false);
                      onClose();
                    }}
                  >
                    Clear & Close
                  </Button>
                )}
              </div>
            </div>
            <ScrollArea className="h-[200px] w-full rounded-md">
              <div className="pr-4">
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No logs available yet...</p>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, index) => (
                      <div
                        key={index}
                        className={`py-1 text-sm ${
                          log.type === 'error'
                            ? 'text-destructive'
                            : log.type === 'warning'
                            ? 'text-yellow-600'
                            : 'text-foreground'
                        }`}
                      >
                        <span className="text-muted-foreground">
                          {log.timestamp.toLocaleTimeString()}{' '}
                        </span>
                        {log.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

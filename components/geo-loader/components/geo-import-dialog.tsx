import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hasErrors, setHasErrors] = useState(false)

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      message,
      type,
      timestamp: new Date()
    }]);
    if (type === 'error') {
      setHasErrors(true);
    }
  };

  const handleLogsUpdate = (messages: string[]) => {
    messages.forEach(message => {
      // Detect message type based on content
      if (message.toLowerCase().includes('error')) {
        addLog(message, 'error');
      } else if (message.toLowerCase().includes('warn')) {
        addLog(message, 'warning');
      } else {
        addLog(message, 'info');
      }
    });
  };

  const handleImportComplete = (result: LoaderResult) => {
    // Log coordinate system information
    if (result.coordinateSystem) {
      if (result.coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        addLog(`Transformed coordinates from ${result.coordinateSystem} to ${COORDINATE_SYSTEMS.WGS84}`, 'info');
      } else {
        addLog(`Using coordinate system: ${result.coordinateSystem}`, 'info');
      }
    }

    // Log feature statistics
    if (result.statistics) {
      addLog(`Imported ${result.statistics.pointCount} features`, 'info');
      if (result.statistics.layerCount) {
        addLog(`Found ${result.statistics.layerCount} layers`, 'info');
      }
      
      // Log feature types
      Object.entries(result.statistics.featureTypes).forEach(([type, count]) => {
        addLog(`- ${count} ${type} features`, 'info');
      });
    }

    // Check for transformation errors in feature properties
    const transformErrors = result.features.filter(f => f.properties?._transformError);
    if (transformErrors.length > 0) {
      addLog(`Warning: ${transformErrors.length} features had transformation errors`, 'warning');
    }

    onImportComplete(result);
    // Don't close dialog if there are errors
    if (!hasErrors) {
      onClose();
    }
  };

  if (!file) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Import Geometry File</DialogTitle>
            <div className="flex items-center gap-2">
              {hasErrors && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Errors occurred during import. Check details for more information.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowLogs(true)}
                title="Show Import Details"
                className="h-8 w-8"
              >
                <Info className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <GeoLoader
            file={file}
            onLoad={handleImportComplete}
            onCancel={onClose}
            onLogsUpdate={handleLogsUpdate}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px] w-full rounded-md border p-4">
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
        </DialogContent>
      </Dialog>
    </>
  )
}

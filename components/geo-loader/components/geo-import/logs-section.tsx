import { Button } from 'components/ui/button';
import { ScrollArea } from 'components/ui/scroll-area';
import { Info } from 'lucide-react';
import { LogsSectionProps } from './types';

export function LogsSection({
  logs,
  loading,
  hasErrors,
  onClearAndClose
}: LogsSectionProps) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium">Import Logs</h4>
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          {hasErrors && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearAndClose}
            >
              Clear & Close
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="h-[200px] w-full rounded-md">
        <div className="pr-4">
          {loading && logs.length === 0 && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          {!loading && logs.length === 0 && (
            <p className="text-sm text-muted-foreground">No logs available yet...</p>
          )}
          {logs.length > 0 && (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={`${log.timestamp.getTime()}-${index}`}>
                  {/* Coordinate System Detection Messages */}
                  {log.code === 'COORDINATE_SYSTEM_DETECTED' ? (
                    <div className="py-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">
                          {log.timestamp.toLocaleTimeString()}{' '}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {log.message}
                        </span>
                      </div>
                      {log.details && (
                        <div className="ml-6 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Source:</span>
                            <span className="capitalize">{log.details.source}</span>
                          </div>
                          {log.details.confidence && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Confidence:</span>
                              <div className="flex-1 h-1.5 max-w-[100px] bg-secondary rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: `${log.details.confidence * 100}%` }}
                                />
                              </div>
                              <span>{Math.round(log.details.confidence * 100)}%</span>
                            </div>
                          )}
                          {log.details.reason && (
                            <div>
                              <span className="text-muted-foreground">Reason: </span>
                              <span>{log.details.reason}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : log.code === 'MODERATE_CONFIDENCE_DETECTION' ? (
                    <div className="py-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">
                          {log.timestamp.toLocaleTimeString()}{' '}
                        </span>
                        <span className="text-sm font-medium text-yellow-600">
                          {log.message}
                        </span>
                      </div>
                      {log.details?.alternatives && (
                        <div className="ml-6 text-xs">
                          <span className="text-muted-foreground">Alternative systems:</span>
                          <div className="space-y-1 mt-1">
                            {log.details.alternatives.map((alt: any, i: number) => (
                              <div key={i} className="flex items-center gap-2">
                                <span>{alt.system}</span>
                                <div className="flex-1 h-1.5 max-w-[100px] bg-secondary rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-yellow-600 rounded-full"
                                    style={{ width: `${alt.confidence * 100}%` }}
                                  />
                                </div>
                                <span>{Math.round(alt.confidence * 100)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
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
                      {log.details?.reason && (
                        <div className="ml-6 text-xs text-muted-foreground">
                          {log.details.reason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

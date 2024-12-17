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
                <div
                  key={`${log.timestamp.getTime()}-${index}`}
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
  );
}

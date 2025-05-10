'use client';

import { useState, ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { dbLogger, LogEntry } from '@/utils/logging/dbLogger';
import { Download, Bug, Trash, Copy, Check } from 'lucide-react';

interface DebugPanelProps {
  children?: ReactNode;
}

const LOG_SOURCE = 'DebugPanel';
const MAX_LOGS = 1000; // Maximum number of logs to keep in memory

export function DebugPanel({ children }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Subscribe to log events
    const unsubscribe = dbLogger.addLogListener((log) => {
      setLogs(prevLogs => {
        const newLogs = [...prevLogs, log];
        // Keep only the last MAX_LOGS entries
        return newLogs.slice(-MAX_LOGS);
      });
    });

    // Log that debug panel is ready
    dbLogger.info('Debug panel initialized', undefined, { source: LOG_SOURCE }).catch(() => {});

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
      dbLogger.info('Debug panel destroyed', undefined, { source: LOG_SOURCE }).catch(() => {});
    };
  }, []);

  const exportLogs = async () => {
    try {
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debug-logs-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await dbLogger.info('Logs exported successfully', undefined, { source: LOG_SOURCE });
    } catch (error) {
      await dbLogger.error('Failed to export logs', { error }, { source: LOG_SOURCE });
    }
  };

  const clearLogs = async () => {
    try {
      setLogs([]);
      await dbLogger.info('Logs cleared', undefined, { source: LOG_SOURCE });
    } catch (error) {
      await dbLogger.error('Failed to clear logs', { error }, { source: LOG_SOURCE });
    }
  };

  const copyLogs = async () => {
    try {
      const logsText = logs.map(log => 
        `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${
          log.data ? '\n' + JSON.stringify(log.data, null, 2) : ''
        }`
      ).join('\n');
      
      await navigator.clipboard.writeText(logsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await dbLogger.info('Logs copied to clipboard', undefined, { source: LOG_SOURCE });
    } catch (error) {
      await dbLogger.error('Failed to copy logs', { error }, { source: LOG_SOURCE });
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-50"
        onClick={() => setIsOpen(true)}
      >
        <Bug className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[600px] bg-background border rounded-lg shadow-lg overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b bg-muted">
        <h3 className="font-medium">Debug Panel</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={copyLogs}
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              exportLogs().catch(async (error) => {
                await dbLogger.error('Failed to handle export logs click', { error }, { source: LOG_SOURCE });
              });
            }}
            title="Download logs"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              clearLogs().catch(async (error) => {
                await dbLogger.error('Failed to handle clear logs click', { error }, { source: LOG_SOURCE });
              });
            }}
            title="Clear logs"
          >
            <Trash className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
          >
            Close
          </Button>
        </div>
      </div>
      
      {children && (
        <div className="border-b pb-4">
          {children}
        </div>
      )}
      
      <div className="p-2">
        <h4 className="font-medium">Logs ({logs.length})</h4>
        <div className="mt-2 max-h-[500px] overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No logs yet</div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, i) => (
                <div 
                  key={`${log.timestamp}-${i}`}
                  className={`text-sm font-mono whitespace-pre-wrap ${
                    log.level === 'error' ? 'text-red-500' :
                    log.level === 'warn' ? 'text-yellow-500' :
                    log.level === 'info' ? 'text-blue-500' :
                    'text-muted-foreground'
                  }`}
                >
                  [{log.timestamp}] {log.level.toUpperCase()}: {log.message}
                  {log.data && (
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
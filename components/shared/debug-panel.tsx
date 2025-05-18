'use client';

import { useState, ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { dbLogger, LogEntry } from '@/utils/logging/dbLogger';
import { Download, Bug, Trash, Copy, Check } from 'lucide-react';
import LogLevelControl from './LogLevelControl';
import { Rnd } from 'react-rnd';
import { SplitPane } from '@rexxars/react-split-pane';
import { useLogStore } from '@/store/logs/logStore';

interface DebugPanelProps {
  children?: ReactNode;
}

const LOG_SOURCE = 'DebugPanel';
const MAX_LOGS = 1000; // Maximum number of logs to keep in memory

export function DebugPanel({ children }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const logs = useLogStore((state) => state.logs);
  const addLog = useLogStore((state) => state.addLog);
  const clearLogsStore = useLogStore((state) => state.clearLogs);

  useEffect(() => {
    // Subscribe to log events globally
    const unsubscribe = dbLogger.addLogListener((log) => {
      addLog(log);
    });

    dbLogger.info('Debug panel initialized', undefined, { source: LOG_SOURCE }).catch(() => {});

    return () => {
      unsubscribe();
      dbLogger.info('Debug panel destroyed', undefined, { source: LOG_SOURCE }).catch(() => {});
    };
  }, [addLog]);

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
      clearLogsStore();
      await dbLogger.info('Logs cleared', undefined, { source: LOG_SOURCE });
    } catch (error) {
      await dbLogger.error('Failed to clear logs', { error }, { source: LOG_SOURCE });
    }
  };

  const copyLogs = async () => {
    try {
      const logsText = logs.map(log => 
        `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.context?.source ? `[${log.context.source}] ` : ''}${log.message}${
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
    <Rnd
      default={{ width: 400, height: 600, x: window.innerWidth - 432, y: window.innerHeight - 632 }}
      minWidth={320}
      minHeight={300}
      bounds="window"
      dragHandleClassName="debug-panel-drag-handle"
      enableResizing={{ bottom: true, right: true, bottomRight: true, top: false, left: false, topLeft: false, topRight: false, bottomLeft: false }}
      style={{ zIndex: 9999 }}
    >
      <div className="h-full w-full bg-background border rounded-lg shadow-lg overflow-hidden flex flex-col" style={{ width: '100%', height: '100%' }}>
        <div className="flex items-center justify-between p-2 border-b bg-muted debug-panel-drag-handle cursor-move select-none">
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
        <SplitPane
          split="horizontal"
          minSize={120}
          defaultSize={220}
          style={{ position: 'relative', flex: 1, height: '100%' }}
          paneStyle={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
          pane1Style={{ overflow: 'auto', background: 'var(--background)' }}
          pane2Style={{ overflow: 'auto', background: 'var(--background)' }}
          resizerStyle={{
            height: 8,
            background: '#eee',
            borderTop: '1px solid #ccc',
            borderBottom: '1px solid #ccc',
            cursor: 'row-resize',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="flex flex-col h-full min-h-0">
            {process.env.NODE_ENV !== 'production' && <LogLevelControl labelWidth="w-40" />}
            {children && (
              <div className="border-b pb-4">{children}</div>
            )}
          </div>
          <div className="flex-1 p-2 flex flex-col min-h-0">
            <h4 className="font-medium">Logs ({logs.length})</h4>
            <div className="flex-1 mt-2 overflow-y-auto min-h-0">
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
                      [{log.timestamp}] {log.level.toUpperCase()}: [{log.context?.source || 'unknown'}] {log.message}
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
        </SplitPane>
      </div>
    </Rnd>
  );
} 
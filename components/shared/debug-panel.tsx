'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LogManager } from '@/core/logging/log-manager';
import { Download, Bug, Trash } from 'lucide-react';

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const logManager = LogManager.getInstance();

  const exportLogs = () => {
    const logs = logManager.getLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    logManager.clearLogs();
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
        <h3 className="font-medium">Debug Logs</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={exportLogs}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearLogs}
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
      <div className="p-4 overflow-auto max-h-[500px] space-y-2">
        {logManager.getLogs().map((log, i) => (
          <div 
            key={i}
            className="text-sm font-mono whitespace-pre-wrap"
          >
            [{log.timestamp}] {log.level}: {log.message}
            {log.data && (
              <pre className="mt-1 p-2 bg-muted rounded text-xs">
                {JSON.stringify(log.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from 'components/ui/dialog';
import { Button } from 'components/ui/button';
import { ScrollArea } from 'components/ui/scroll-area';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

interface LogEntry {
  type: 'info' | 'error' | 'success';
  message: string;
  timestamp: Date;
}

interface ImportLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: LogEntry[];
}

export function ImportLogDialog({ open, onOpenChange, logs }: ImportLogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Log</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[400px] rounded-md border p-4">
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div 
                key={index} 
                className={`flex items-start gap-2 text-sm font-mono ${
                  log.type === 'error' ? 'text-red-500' :
                  log.type === 'success' ? 'text-green-500' :
                  'text-muted-foreground'
                }`}
              >
                {log.type === 'error' ? (
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                ) : log.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 break-all">
                  <span className="text-xs text-muted-foreground">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <div className="whitespace-pre-wrap">{log.message}</div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

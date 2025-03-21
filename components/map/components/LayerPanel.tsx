'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'LayerPanel';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

interface LayerPanelProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export function LayerPanel({ children, defaultCollapsed = false }: LayerPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className="relative h-full">
      <Card className={`h-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-full'}`}>
        <div className="flex items-center justify-between p-2 border-b">
          {!isCollapsed && <h3 className="text-base font-semibold">Layers</h3>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="ml-auto"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        {!isCollapsed && (
          <ScrollArea className="h-[calc(100%-2.5rem)]">
            <div className="p-2">
              {children}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
} 
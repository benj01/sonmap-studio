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
    <div className="relative">
      <Card className={`bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-80'}`}>
        <div className="flex items-center justify-between p-4 border-b">
          {!isCollapsed && <h3 className="text-lg font-semibold">Layers</h3>}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="ml-auto"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        {!isCollapsed && (
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="p-4">
              {children}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
} 
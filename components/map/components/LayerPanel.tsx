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

  logger.info('LayerPanel render', {
    isCollapsed,
    hasChildren: !!children
  });

  return (
    <div className="relative h-full">
      <Card className={`h-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300 overflow-hidden ${isCollapsed ? 'w-12' : 'w-[300px]'}`}>
        <div className="flex items-center justify-between p-2 border-b">
          <div className={`transition-opacity duration-300 flex-1 ${isCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
            <h3 className="text-base font-semibold">Layers</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logger.info('Layer panel toggle clicked', { currentState: isCollapsed });
              setIsCollapsed(!isCollapsed);
            }}
            className={`shrink-0 ${isCollapsed ? 'ml-0' : 'ml-auto'}`}
            aria-label={isCollapsed ? 'Expand layer panel' : 'Collapse layer panel'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <div className={`transition-all duration-300 ${isCollapsed ? 'opacity-0 invisible w-0' : 'opacity-100 visible w-full'}`}>
          <ScrollArea className="h-[calc(100%-2.5rem)]">
            <div className="p-2">
              {children}
            </div>
          </ScrollArea>
        </div>
      </Card>
    </div>
  );
} 
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface LayerPanelProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export function LayerPanel({ children, defaultCollapsed = false }: LayerPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className="h-full">
      <Card className={`h-full relative bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-[280px]'}`}>
        <div className="flex items-center justify-between p-2 border-b">
          <div className={`transition-opacity duration-300 flex-1 ${isCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
            <h3 className="text-sm font-semibold">Layers</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsCollapsed(!isCollapsed);
            }}
            className="shrink-0 absolute right-1 top-2 z-10"
            aria-label={isCollapsed ? 'Expand layer panel' : 'Collapse layer panel'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <div className={`transition-all duration-300 h-[calc(100%-2.5rem)] ${isCollapsed ? 'opacity-0 invisible w-0' : 'opacity-100 visible w-full'}`}>
          <ScrollArea className="h-full w-full">
            <div className="p-2">
              <div className="text-xs space-y-2 w-full">
                {children}
              </div>
            </div>
          </ScrollArea>
        </div>
      </Card>
    </div>
  );
} 
'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LayerPanelProps {
  className?: string;
  children?: React.ReactNode;
}

export function LayerPanel({ className = '', children }: LayerPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className={cn(
        'absolute top-0 right-0 h-full bg-background/95 backdrop-blur-sm border-l transition-all duration-200 ease-in-out',
        isCollapsed ? 'w-12' : 'w-80',
        className
      )}
    >
      <div className="flex items-center h-12 px-4 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="mr-2"
          title={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {isCollapsed ? <ChevronLeft /> : <ChevronRight />}
        </Button>
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            <span className="font-medium">Layers</span>
          </div>
        )}
      </div>
      
      <div className={cn(
        'h-[calc(100%-3rem)] overflow-y-auto',
        isCollapsed ? 'px-2 py-4' : 'p-4'
      )}>
        {isCollapsed ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(false)}
            className="w-full"
            title="Expand panel"
          >
            <Layers className="w-5 h-5" />
          </Button>
        ) : (
          children
        )}
      </div>
    </div>
  );
} 
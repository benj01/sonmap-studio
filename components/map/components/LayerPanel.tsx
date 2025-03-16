'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LayerPanelProps {
  className?: string;
  children?: React.ReactNode;
  currentView?: '2d' | '3d';
  children2D?: React.ReactNode;
  children3D?: React.ReactNode;
}

export function LayerPanel({ 
  className = '', 
  children,
  currentView = '2d',
  children2D,
  children3D
}: LayerPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Determine which children to render based on the current view
  const renderChildren = () => {
    // If specific view children are provided, use them based on currentView
    if (currentView === '3d' && children3D) {
      return children3D;
    } else if (currentView === '2d' && children2D) {
      return children2D;
    }
    // Otherwise fall back to the default children
    return children;
  };

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
            <span className="font-medium">Layers {currentView === '3d' ? '(3D)' : ''}</span>
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
          renderChildren()
        )}
      </div>
    </div>
  );
} 
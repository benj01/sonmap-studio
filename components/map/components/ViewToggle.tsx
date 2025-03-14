'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Map, Box } from 'lucide-react';

interface ViewToggleProps {
  onViewChange: (view: '2d' | '3d') => void;
  currentView: '2d' | '3d';
  className?: string;
}

export function ViewToggle({
  onViewChange,
  currentView,
  className = ''
}: ViewToggleProps) {
  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <Button
        variant={currentView === '2d' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onViewChange('2d')}
        title="2D Map View"
        className="flex items-center"
      >
        <Map className="h-4 w-4 mr-1" />
        <span>2D</span>
      </Button>
      <Button
        variant={currentView === '3d' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onViewChange('3d')}
        title="3D Map View"
        className="flex items-center"
      >
        <Box className="h-4 w-4 mr-1" />
        <span>3D</span>
      </Button>
    </div>
  );
} 
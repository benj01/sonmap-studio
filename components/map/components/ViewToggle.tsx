'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Map, Box } from 'lucide-react';
import { useMapContext } from '../hooks/useMapContext';
import { useCesium } from '../context/CesiumContext';
import { useViewSync, ViewState } from '../hooks/useViewSync';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'ViewToggle';
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

interface ViewToggleProps {
  currentView: '2d' | '3d';
  onViewChange: (view: '2d' | '3d') => void;
  disabled?: boolean;
}

export function ViewToggle({ currentView, onViewChange, disabled = false }: ViewToggleProps) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { map } = useMapContext();
  const { viewer } = useCesium();
  const { syncViews, convert3DTo2D } = useViewSync();

  const handleViewToggle = async () => {
    if (disabled || isTransitioning) {
      return;
    }

    try {
      setIsTransitioning(true);
      const newView = currentView === '2d' ? '3d' : '2d';
      logger.info('Toggling view', { from: currentView, to: newView });

      // Get current view state before switching
      if (currentView === '2d' && map) {
        const center = map.getCenter();
        const state = {
          center: [center.lng, center.lat] as [number, number],
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing()
        };

        // First trigger the view change
        onViewChange(newView);

        // Then sync the view state once the new view is ready
        // Add a small delay to ensure the new view is mounted
        await new Promise(resolve => setTimeout(resolve, 100));
        if (viewer) {
          await syncViews('2d', state, map, viewer);
        }

      } else if (currentView === '3d' && viewer && map) {
        // Get current Cesium camera state
        const state = convert3DTo2D(viewer.camera);
        
        // First sync the view state
        await syncViews('3d', state, map, viewer);
        
        // Then trigger the view change
        onViewChange(newView);
      }

    } catch (error) {
      logger.error('Error during view toggle', error);
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleViewToggle}
      disabled={disabled || isTransitioning}
      className="h-10 w-10 bg-background"
      title={`Switch to ${currentView === '2d' ? '3D' : '2D'} view`}
    >
      {currentView === '2d' ? (
        <Box className="h-4 w-4" />
      ) : (
        <Map className="h-4 w-4" />
      )}
    </Button>
  );
} 
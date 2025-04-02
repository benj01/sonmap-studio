'use client';

import { useState, useEffect } from 'react';
import { HexColorPicker } from "react-colorful";
import { useLayer } from '@/store/layers/hooks';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogManager } from '@/core/logging/log-manager';
import type { Layer } from '@/store/layers/types';

interface LayerSettingsDialogProps {
  layerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SOURCE = 'LayerSettingsDialog';
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

export function LayerSettingsDialog({ layerId, open, onOpenChange }: LayerSettingsDialogProps) {
  // Get the base layer ID by removing any geometry type suffix
  const baseLayerId = layerId.replace(/-line$|-fill$|-circle$/, '');
  const { layer, updateStyle } = useLayer(baseLayerId);
  const [color, setColor] = useState("#088");

  logger.debug('LayerSettingsDialog render', {
    originalLayerId: layerId,
    baseLayerId,
    hasLayer: !!layer,
    layerMetadata: layer?.metadata,
    open
  });

  useEffect(() => {
    // Initialize color from layer style if available
    if (layer?.metadata?.style?.paint) {
      const currentColor = layer.metadata.style.paint['fill-color'] || 
                          layer.metadata.style.paint['line-color'] || 
                          layer.metadata.style.paint['circle-color'] ||
                          "#088";
      logger.debug('Initializing color from layer style', {
        baseLayerId,
        currentColor,
        paint: layer.metadata.style.paint
      });
      setColor(currentColor);
    }
  }, [layer, baseLayerId]);

  const handleSave = () => {
    if (!layer) {
      logger.error('Cannot save style - layer not found', { baseLayerId });
      return;
    }

    logger.debug('Starting style save', {
      baseLayerId,
      layerType: layer.metadata?.type,
      currentStyle: layer.metadata?.style,
      newColor: color
    });

    // Determine layer type from the layer's metadata or properties
    const layerType = layer.metadata?.type;
    const isLineLayer = layerType === 'line' || layerType === 'linestring';
    const isFillLayer = layerType === 'fill' || layerType === 'polygon';
    const isCircleLayer = layerType === 'circle' || layerType === 'point';
    
    // Create paint object based on geometry type
    const paint: Record<string, any> = {};
    
    if (isLineLayer) {
      paint['line-color'] = color;
      paint['line-width'] = 2;
    } else if (isFillLayer) {
      paint['fill-color'] = color;
      paint['fill-opacity'] = 0.4;
      paint['fill-outline-color'] = '#000';
    } else if (isCircleLayer) {
      paint['circle-color'] = color;
      paint['circle-radius'] = 5;
      paint['circle-stroke-width'] = 2;
      paint['circle-stroke-color'] = '#000';
    } else {
      logger.warn('Unknown layer type - defaulting to line style', {
        baseLayerId,
        layerType,
        metadata: layer.metadata
      });
      paint['line-color'] = color;
      paint['line-width'] = 2;
    }

    logger.debug('Calling updateStyle', {
      baseLayerId,
      layerType,
      paint,
      layerExists: !!layer,
      updateStyleExists: !!updateStyle,
      metadata: layer.metadata
    });

    try {
      updateStyle({ paint });
      logger.info('Style update called successfully', {
        baseLayerId,
        paint
      });
    } catch (error) {
      logger.error('Error updating style', {
        baseLayerId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Layer Settings - {layer?.metadata?.name || baseLayerId}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="color">Layer Color</Label>
            <div className="flex gap-4 items-start">
              <HexColorPicker color={color} onChange={setColor} />
              <Input 
                id="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-[100px]"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 
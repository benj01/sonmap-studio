'use client';

import { useState, useEffect, useMemo } from 'react';
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

interface GeometryTypes {
  hasPolygons: boolean;
  hasLines: boolean;
  hasPoints: boolean;
}

export function LayerSettingsDialog({ layerId, open, onOpenChange }: LayerSettingsDialogProps) {
  // Get the base layer ID by removing any geometry type suffix
  const baseLayerId = layerId.replace(/-line$|-fill$|-circle$/, '');
  const { layer, updateStyle } = useLayer(baseLayerId);
  const [color, setColor] = useState("#088");

  // Determine geometry types from layer metadata or layer ID
  const geometryTypes = useMemo((): GeometryTypes => {
    // First try to get from metadata
    if (layer?.metadata?.geometryTypes) {
      return layer.metadata.geometryTypes as GeometryTypes;
    }

    // Then try to infer from layer type
    const layerType = layer?.metadata?.type?.toLowerCase();
    if (layerType) {
      if (layerType.includes('polygon')) return { hasPolygons: true, hasLines: false, hasPoints: false };
      if (layerType.includes('line') || layerType.includes('string')) return { hasPolygons: false, hasLines: true, hasPoints: false };
      if (layerType.includes('point')) return { hasPolygons: false, hasLines: false, hasPoints: true };
    }

    // Finally, try to infer from the original layer ID
    if (layerId.endsWith('-fill')) return { hasPolygons: true, hasLines: false, hasPoints: false };
    if (layerId.endsWith('-line')) return { hasPolygons: false, hasLines: true, hasPoints: false };
    if (layerId.endsWith('-circle')) return { hasPolygons: false, hasLines: false, hasPoints: true };

    // Default to all false if we can't determine
    return { hasPolygons: false, hasLines: false, hasPoints: false };
  }, [layer?.metadata, layerId]);

  logger.debug('LayerSettingsDialog render', {
    originalLayerId: layerId,
    baseLayerId,
    hasLayer: !!layer,
    layerMetadata: layer?.metadata,
    geometryTypes,
    open
  });

  useEffect(() => {
    // Initialize color from layer style if available
    if (layer?.metadata?.style?.paint) {
      // Try to get color based on detected geometry types
      const currentColor = (geometryTypes.hasPolygons && layer.metadata.style.paint['fill-color']) ||
                          (geometryTypes.hasLines && layer.metadata.style.paint['line-color']) ||
                          (geometryTypes.hasPoints && layer.metadata.style.paint['circle-color']) ||
                          "#088";
      
      logger.debug('Initializing color from layer style', {
        baseLayerId,
        currentColor,
        paint: layer.metadata.style.paint,
        geometryTypes
      });
      setColor(currentColor);
    }
  }, [layer, baseLayerId, geometryTypes]);

  const handleSave = () => {
    if (!layer) {
      logger.error('Cannot save style - layer not found', { baseLayerId });
      return;
    }

    logger.debug('Starting style save', {
      baseLayerId,
      layerType: layer.metadata?.type,
      geometryTypes,
      currentStyle: layer.metadata?.style,
      newColor: color
    });

    // Create paint object based on detected geometry types
    const paint: Record<string, any> = {};
    
    if (geometryTypes.hasLines) {
      paint['line-color'] = color;
      paint['line-width'] = 2;
    } else if (geometryTypes.hasPolygons) {
      paint['fill-color'] = color;
      paint['fill-opacity'] = 0.4;
      paint['fill-outline-color'] = '#000';
    } else if (geometryTypes.hasPoints) {
      paint['circle-color'] = color;
      paint['circle-radius'] = 5;
      paint['circle-stroke-width'] = 2;
      paint['circle-stroke-color'] = '#000';
    } else {
      // If we can't determine geometry type, try to infer from existing paint properties
      const existingPaint = layer.metadata?.style?.paint || {};
      if ('line-color' in existingPaint) {
        paint['line-color'] = color;
        paint['line-width'] = existingPaint['line-width'] || 2;
      } else if ('fill-color' in existingPaint) {
        paint['fill-color'] = color;
        paint['fill-opacity'] = existingPaint['fill-opacity'] || 0.4;
        paint['fill-outline-color'] = existingPaint['fill-outline-color'] || '#000';
      } else if ('circle-color' in existingPaint) {
        paint['circle-color'] = color;
        paint['circle-radius'] = existingPaint['circle-radius'] || 5;
        paint['circle-stroke-width'] = existingPaint['circle-stroke-width'] || 2;
        paint['circle-stroke-color'] = existingPaint['circle-stroke-color'] || '#000';
      } else {
        logger.warn('Could not determine geometry type - defaulting to line style', {
          baseLayerId,
          layerType: layer.metadata?.type,
          geometryTypes,
          existingPaint
        });
        paint['line-color'] = color;
        paint['line-width'] = 2;
      }
    }

    logger.debug('Calling updateStyle', {
      baseLayerId,
      geometryTypes,
      paint,
      layerExists: !!layer,
      updateStyleExists: !!updateStyle,
      metadata: layer.metadata
    });

    try {
      updateStyle({ paint });
      logger.info('Style update called successfully', {
        baseLayerId,
        paint,
        geometryTypes
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
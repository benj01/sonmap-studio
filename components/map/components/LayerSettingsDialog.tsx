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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeightConfigurationDialog, HeightSource } from '../dialogs/HeightConfigurationDialog';
import { useLayerData } from '../hooks/useLayerData';
import { Box, RefreshCw } from 'lucide-react';
import { FeatureCollection } from 'geojson';
import { useLayerStore } from '@/store/layers/layerStore';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";

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
  const { data } = useLayerData(baseLayerId);
  const [color, setColor] = useState("#088");
  const [heightConfigOpen, setHeightConfigOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("appearance");
  const [showHeightUpdateAlert, setShowHeightUpdateAlert] = useState(false);
  const { toast } = useToast();
  
  // Get direct access to updateLayerHeightSource action
  const updateLayerHeightSource = useLayerStore(state => state.updateLayerHeightSource);

  // Convert layer data to FeatureCollection for HeightConfigurationDialog
  const featureCollection = useMemo(() => {
    if (!data || !data.features) return null;
    return {
      type: 'FeatureCollection',
      features: data.features
    } as FeatureCollection;
  }, [data]);

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

  const handleHeightSourceSelect = (heightSource: HeightSource) => {
    logger.info('Height source selected in LayerSettingsDialog', { 
      layerId: baseLayerId,
      heightSource 
    });

    // Update the layer store with height source information
    try {
      updateLayerHeightSource(baseLayerId, {
        type: heightSource.type,
        attributeName: heightSource.attributeName
      });
      
      // If it applies to all layers, you'd need to loop through the layers and apply to each
      if (heightSource.applyToAllLayers) {
        logger.info('Applying height source to all layers (not implemented yet)');
        // This would require getting all layers and applying the height source to each one
      }
      
      // If it saves preference, you'd need to store this in user preferences
      if (heightSource.savePreference) {
        logger.info('Saving height source preference (not implemented yet)');
        // This would require storing the preference in user settings or a preferences store
      }
      
      logger.info('Height source update successful', {
        layerId: baseLayerId,
        type: heightSource.type,
        attributeName: heightSource.attributeName,
        applyToAll: heightSource.applyToAllLayers,
        savePreference: heightSource.savePreference
      });

      // Show toast notification
      toast({
        title: "Height configuration updated",
        description: "Switch to 3D view to see the changes. You may need to refresh the 3D view.",
        duration: 5000
      });

      setShowHeightUpdateAlert(true);
    } catch (error) {
      logger.error('Error updating height source', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Show error toast
      toast({
        title: "Error updating height configuration",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
        duration: 5000
      });
    }
    
    setHeightConfigOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Layer Settings - {layer?.metadata?.name || baseLayerId}</DialogTitle>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="3d">3D Settings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="appearance" className="mt-0">
              <div className="grid gap-4 py-2">
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
            </TabsContent>
            
            <TabsContent value="3d" className="mt-0">
              <div className="grid gap-4 py-2">
                {showHeightUpdateAlert && (
                  <Alert className="mb-4">
                    <RefreshCw className="h-4 w-4" />
                    <AlertTitle>Height configuration updated</AlertTitle>
                    <AlertDescription>
                      Switch to 3D view to see the changes. You may need to refresh the 3D view.
                    </AlertDescription>
                  </Alert>
                )}
                
                <Button 
                  onClick={() => setHeightConfigOpen(true)}
                  className="flex items-center gap-2"
                  disabled={!featureCollection}
                >
                  <Box className="h-4 w-4" />
                  Configure Height Data
                </Button>
                <p className="text-xs text-gray-500">
                  Configure how layer data is visualized in 3D. Set height data sources, 
                  extrusion options, and more.
                </p>
              </div>
            </TabsContent>
          </Tabs>
          
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
      
      {/* Height Configuration Dialog */}
      {featureCollection && (
        <HeightConfigurationDialog
          open={heightConfigOpen}
          onOpenChange={setHeightConfigOpen}
          layerId={baseLayerId}
          layerName={layer?.metadata?.name || baseLayerId}
          featureCollection={featureCollection}
          onHeightSourceSelect={handleHeightSourceSelect}
        />
      )}
    </>
  );
} 
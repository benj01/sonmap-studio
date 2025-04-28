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
import { Box, RefreshCw, Info, Check, X } from 'lucide-react';
import { FeatureCollection } from 'geojson';
import { useLayerStore, layerSelectors } from '@/store/layers/layerStore';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import type { GeoJSON } from 'geojson';
import { usePreferenceStore } from '@/store/preference/userPreferenceStore';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckedState } from '@radix-ui/react-checkbox';

interface LayerSettingsDialogProps {
  layerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: string;
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

/**
 * Check if a layer is compatible with a selected height configuration
 */
interface LayerCompatibility {
  id: string;
  name: string;
  compatible: boolean;
  reason?: string;
  hasHeightConfig: boolean;
  currentConfig?: {
    type: 'z_coord' | 'attribute' | 'none';
    attributeName?: string;
  };
}

export function LayerSettingsDialog({ layerId, open, onOpenChange, initialTab }: LayerSettingsDialogProps) {
  // Get the base layer ID by removing any geometry type suffix
  const baseLayerId = layerId.replace(/-line$|-fill$|-circle$/, '');
  const { layer, updateStyle } = useLayer(baseLayerId);
  const { data } = useLayerData(baseLayerId);
  const [color, setColor] = useState("#088");
  const [heightConfigOpen, setHeightConfigOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || "appearance");
  const [showHeightUpdateAlert, setShowHeightUpdateAlert] = useState(false);
  const { toast } = useToast();
  
  // States for multi-layer selection
  const [applyToAllLayers, setApplyToAllLayers] = useState(false);
  const [layerSelectionOpen, setLayerSelectionOpen] = useState(false);
  const [compatibleLayers, setCompatibleLayers] = useState<LayerCompatibility[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<Record<string, boolean>>({});
  
  // Get direct access to updateLayerHeightSource action
  const updateLayerHeightSource = useLayerStore(state => state.updateLayerHeightSource);
  
  // Get preference store action for saving height source preferences
  const setHeightSourcePreference = usePreferenceStore(state => state.setHeightSourcePreference);

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

  // If initialTab changes while dialog is opened, update activeTab
  useEffect(() => {
    if (open && initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

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

  // Check if a layer has a numeric attribute that could be used for height
  const hasNumericAttribute = (layerFeatures: GeoJSON.Feature[], attributeName: string): boolean => {
    if (!layerFeatures || !attributeName) return false;
    
    // Check if attribute exists and is numeric in at least 50% of features
    let validCount = 0;
    
    for (const feature of layerFeatures) {
      if (!feature.properties) continue;
      
      const value = feature.properties[attributeName];
      const numValue = typeof value === 'number' ? value : 
                      typeof value === 'string' ? parseFloat(value) : NaN;
      
      if (!isNaN(numValue) && numValue >= -100 && numValue <= 4000) {
        validCount++;
      }
    }
    
    // Return true if at least 50% of features have valid values
    return validCount >= (layerFeatures.length * 0.5);
  };
  
  // Check if a layer has Z coordinates
  const hasZCoordinates = (layerFeatures: GeoJSON.Feature[]): boolean => {
    if (!layerFeatures) return false;
    
    let zCount = 0;
    const totalFeatures = layerFeatures.length;
    
    for (const feature of layerFeatures) {
      if (!feature.geometry) continue;
      
      try {
        // Simple check for Z coordinates based on first coordinate
        const coords = getFirstCoordinate(feature.geometry);
        if (coords && coords.length >= 3 && typeof coords[2] === 'number' && !isNaN(coords[2])) {
          zCount++;
        }
      } catch (error) {
        // Skip features with invalid geometry
      }
    }
    
    return zCount >= (totalFeatures * 0.5);
  };
  
  // Get the first coordinate from any geometry type
  const getFirstCoordinate = (geometry: GeoJSON.Geometry): number[] | null => {
    switch (geometry.type) {
      case 'Point':
        return geometry.coordinates;
      case 'LineString':
        return geometry.coordinates[0];
      case 'Polygon':
        return geometry.coordinates[0]?.[0];
      case 'MultiPoint':
        return geometry.coordinates[0];
      case 'MultiLineString':
        return geometry.coordinates[0]?.[0];
      case 'MultiPolygon':
        return geometry.coordinates[0]?.[0]?.[0];
      default:
        return null;
    }
  };
  
  /**
   * Check if a layer is compatible with a height source configuration
   * Determines if the layer has the required attributes or Z coordinates
   */
  const checkLayerCompatibility = async (
    targetLayerId: string, 
    heightSource: HeightSource
  ): Promise<LayerCompatibility> => {
    const layer = layerSelectors.getLayerById(useLayerStore.getState())(targetLayerId);
    if (!layer) {
      return {
        id: targetLayerId,
        name: 'Unknown layer',
        compatible: false,
        reason: 'Layer not found',
        hasHeightConfig: false
      };
    }

    // Check if layer already has height configuration
    const hasHeightConfig = !!(layer.metadata?.height?.sourceType);
    let currentConfig: { type: 'z_coord' | 'attribute' | 'none'; attributeName?: string } | undefined = undefined;
    
    if (hasHeightConfig && layer.metadata?.height?.sourceType) {
      currentConfig = {
        type: layer.metadata.height.sourceType,
        attributeName: layer.metadata.height.attributeName
      };
    }

    // Get layer data to check compatibility
    // Use the useLayerData hook's internal function to get data directly
    let layerFeatures: GeoJSON.Feature[] = [];
    try {
      // Try to get from store first (more efficient if already loaded)
      if (layer.geoJsonData?.features) {
        layerFeatures = layer.geoJsonData.features;
      } else {
        // Otherwise load from source
        const layerData = await fetch(`/api/layers/${targetLayerId}/data`);
        if (!layerData.ok) throw new Error(`Failed to load layer data: ${layerData.statusText}`);
        const data = await layerData.json();
        if (data.features) layerFeatures = data.features;
      }
    } catch (error) {
      logger.error('Error loading layer data for compatibility check', { targetLayerId, error });
      return {
        id: targetLayerId,
        name: layer.metadata?.name || targetLayerId,
        compatible: false,
        reason: 'Failed to load layer data',
        hasHeightConfig,
        currentConfig
      };
    }

    // If no features, not compatible
    if (!layerFeatures || layerFeatures.length === 0) {
      return {
        id: targetLayerId,
        name: layer.metadata?.name || targetLayerId,
        compatible: false,
        reason: 'Layer has no features',
        hasHeightConfig,
        currentConfig
      };
    }

    if (heightSource.type === 'z_coord') {
      // For Z coordinates, check if the target layer has Z values
      const hasZ = hasZCoordinates(layerFeatures);
      return {
        id: targetLayerId,
        name: layer.metadata?.name || targetLayerId,
        compatible: hasZ,
        reason: hasZ ? undefined : 'Layer does not have Z coordinates',
        hasHeightConfig,
        currentConfig
      };
    } else if (heightSource.type === 'attribute' && heightSource.attributeName) {
      // For attribute-based height, check if the target layer has the attribute
      const hasAttribute = hasNumericAttribute(layerFeatures, heightSource.attributeName);
      return {
        id: targetLayerId,
        name: layer.metadata?.name || targetLayerId,
        compatible: hasAttribute,
        reason: hasAttribute ? undefined : `Layer does not have attribute: ${heightSource.attributeName}`,
        hasHeightConfig,
        currentConfig
      };
    } else {
      // For 'none', all layers are compatible
      return {
        id: targetLayerId,
        name: layer.metadata?.name || targetLayerId,
        compatible: true,
        hasHeightConfig,
        currentConfig
      };
    }
  };

  /**
   * Find all layers compatible with the selected height source
   */
  const findCompatibleLayers = async (heightSource: HeightSource) => {
    // Get all layers except the current one
    const allLayers = layerSelectors.getAllLayers(useLayerStore.getState())
      .filter(l => l.id !== baseLayerId);
    
    logger.debug('Finding compatible layers', { 
      baseLayerId,
      heightSource,
      layerCount: allLayers.length
    });

    // Initialize with empty compatibility results
    setCompatibleLayers([]);
    setSelectedLayers({});
    
    // Check compatibility for each layer
    const compatibilityResults: LayerCompatibility[] = [];
    const selectedLayersMap: Record<string, boolean> = {};
    
    // Use Promise.all to check all layers in parallel
    const compatibilityPromises = allLayers.map(layer => 
      checkLayerCompatibility(layer.id, heightSource)
    );
    
    const results = await Promise.all(compatibilityPromises);
    
    // Process results
    for (const result of results) {
      compatibilityResults.push(result);
      // Pre-select compatible layers that don't already have a height config
      selectedLayersMap[result.id] = result.compatible && !result.hasHeightConfig;
    }
    
    logger.debug('Compatibility check complete', { 
      results: compatibilityResults,
      selectedLayers: selectedLayersMap
    });
    
    setCompatibleLayers(compatibilityResults);
    setSelectedLayers(selectedLayersMap);
    
    // Only show layer selection if we have compatible layers
    const hasCompatibleLayers = compatibilityResults.some(r => r.compatible);
    setLayerSelectionOpen(hasCompatibleLayers);
    
    return {
      compatibilityResults,
      selectedLayersMap,
      hasCompatibleLayers
    };
  };

  /**
   * Apply height configuration to selected layers
   */
  const applyHeightConfigToSelectedLayers = async (heightSource: HeightSource) => {
    // Get selected layer IDs (filter out the current layer which is handled separately)
    const selectedLayerIds = Object.entries(selectedLayers)
      .filter(([id, selected]) => selected && id !== baseLayerId)
      .map(([id]) => id);
    
    logger.debug('Applying height config to selected layers', { 
      baseLayerId,
      heightSource,
      selectedLayerIds
    });
    
    if (selectedLayerIds.length === 0) {
      logger.debug('No layers selected for height configuration');
      return;
    }
    
    // Apply to each selected layer
    let successCount = 0;
    let errorCount = 0;
    
    for (const targetLayerId of selectedLayerIds) {
      try {
        // Apply the same height source configuration to this layer
        // Make sure type is always defined to satisfy TypeScript
        updateLayerHeightSource(targetLayerId, {
          type: heightSource.type,
          attributeName: heightSource.attributeName,
          interpretationMode: heightSource.interpretationMode
        });
        successCount++;
      } catch (error) {
        logger.error('Error applying height configuration to layer', { 
          targetLayerId, 
          error 
        });
        errorCount++;
      }
    }
    
    // Show toast with results
    if (successCount > 0) {
      toast({
        title: "Height configuration applied",
        description: `Applied to ${successCount} additional layer${successCount !== 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
        variant: errorCount > 0 ? "destructive" : "default"
      });
    } else if (errorCount > 0) {
      toast({
        title: "Height configuration failed",
        description: `Failed to apply to ${errorCount} layer${errorCount !== 1 ? 's' : ''}`,
        variant: "destructive"
      });
    }
  };

  /**
   * Handle height source selection from the Height Configuration Dialog
   */
  const handleHeightSourceSelect = async (heightSource: HeightSource) => {
    logger.debug('Height source selected', { heightSource, baseLayerId });
    
    try {
      // First, apply to the current layer
      updateLayerHeightSource(baseLayerId, {
        type: heightSource.type,
        attributeName: heightSource.attributeName,
        interpretationMode: heightSource.interpretationMode
      });
      
      // Show success toast for current layer
      toast({
        title: "Height configuration updated",
        description: `Successfully applied to ${layer?.metadata?.name || baseLayerId}`,
      });

      // Save preference if requested
      if (heightSource.savePreference) {
        setHeightSourcePreference({
          type: heightSource.type,
          attributeName: heightSource.attributeName,
          interpretationMode: heightSource.interpretationMode
        });
        toast({
          title: "Preference saved",
          description: "This height configuration will be used for future imports"
        });
      }
      
      // If apply to all layers is selected, find compatible layers and show selection UI
      if (heightSource.applyToAllLayers) {
        // Find compatible layers
        const { hasCompatibleLayers } = await findCompatibleLayers(heightSource);
        
        if (hasCompatibleLayers) {
          // Show height update alert with layer selection
          setShowHeightUpdateAlert(true);
        } else {
          // No compatible layers found
          toast({
            title: "No compatible layers found",
            description: "No other layers can use this height configuration",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      // Handle errors
      logger.error('Error updating height source', { baseLayerId, error });
      toast({
        title: "Height configuration failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  /**
   * Handle toggling layer selection for multi-layer application
   */
  const handleLayerSelectionToggle = (layerId: string, checked: CheckedState) => {
    setSelectedLayers(prev => ({
      ...prev,
      [layerId]: checked === true
    }));
  };

  /**
   * Handle select all / deselect all for layer selection
   */
  const handleSelectAllLayers = (select: boolean) => {
    const newSelectedLayers = { ...selectedLayers };
    for (const layer of compatibleLayers) {
      if (layer.compatible) {
        newSelectedLayers[layer.id] = select;
      }
    }
    setSelectedLayers(newSelectedLayers);
  };

  /**
   * Apply the height configuration to all selected layers
   */
  const handleApplyToSelectedLayers = () => {
    // Get the height configuration from the current layer
    if (!layer?.metadata?.height || !layer.metadata.height.sourceType) {
      logger.error('Cannot apply to other layers - current layer has no height configuration');
      return;
    }
    
    const heightSource: HeightSource = {
      type: layer.metadata.height.sourceType,
      attributeName: layer.metadata.height.attributeName,
      interpretationMode: layer.metadata.height.interpretationMode,
      applyToAllLayers: true,
      savePreference: false
    };
    
    // Apply to selected layers
    applyHeightConfigToSelectedLayers(heightSource);
    
    // Close the alert
    setShowHeightUpdateAlert(false);
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
      
      {/* Layer Selection Dialog */}
      <Dialog open={layerSelectionOpen} onOpenChange={setLayerSelectionOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Select Layers to Apply Height Configuration</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm mb-4">
              The following layers are compatible with the selected height configuration.
              Select which layers you want to apply the configuration to:
            </p>
            
            <ScrollArea className="h-[200px] border rounded-md p-2">
              <div className="space-y-2">
                {compatibleLayers.map(layer => (
                  <div 
                    key={layer.id}
                    className={`flex items-center justify-between p-2 rounded ${
                      layer.compatible ? 'hover:bg-gray-100' : 'opacity-70'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id={`layer-${layer.id}`}
                        checked={selectedLayers[layer.id] || false}
                        onCheckedChange={(checked) => {
                          setSelectedLayers(prev => ({
                            ...prev,
                            [layer.id]: !!checked
                          }));
                        }}
                        disabled={!layer.compatible || (layer.hasHeightConfig && layer.currentConfig?.type === 'attribute')}
                      />
                      <div>
                        <label 
                          htmlFor={`layer-${layer.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {layer.name}
                        </label>
                        
                        {/* Status badges */}
                        <div className="flex mt-1 gap-1">
                          {layer.compatible ? (
                            <Badge variant="outline" className="bg-green-50 text-green-800 text-xs">
                              Compatible
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-800 text-xs">
                              Not Compatible
                            </Badge>
                          )}
                          
                          {layer.hasHeightConfig && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-800 text-xs">
                              Has Configuration
                            </Badge>
                          )}
                        </div>
                        
                        {/* Reason for incompatibility or current config */}
                        {!layer.compatible && layer.reason && (
                          <p className="text-xs text-gray-500 mt-1">{layer.reason}</p>
                        )}
                        
                        {layer.hasHeightConfig && (
                          <p className="text-xs text-gray-500 mt-1">
                            Current: {layer.currentConfig?.type} 
                            {layer.currentConfig?.type === 'attribute' && layer.currentConfig?.attributeName && 
                             ` (${layer.currentConfig.attributeName})`}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Status icon */}
                    <div>
                      {layer.compatible ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
                
                {compatibleLayers.length === 0 && (
                  <p className="text-sm text-gray-500 p-2">
                    No other layers found in the project.
                  </p>
                )}
              </div>
            </ScrollArea>
            
            <div className="flex items-center mt-4">
              <Info className="h-4 w-4 text-blue-500 mr-2" />
              <p className="text-xs text-gray-600">
                Only compatible layers are selectable. Layers that already have the exact same height configuration will be skipped.
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setLayerSelectionOpen(false);
                setHeightConfigOpen(true);
              }}
            >
              Back
            </Button>
            <Button 
              onClick={() => {
                // Get the stored heightSource from the current layer
                const currentLayer = layerSelectors.getLayerById(useLayerStore.getState())(baseLayerId);
                const heightConfig = currentLayer?.metadata?.height;
                
                if (heightConfig) {
                  applyHeightConfigToSelectedLayers({
                    type: heightConfig.sourceType,
                    attributeName: heightConfig.attributeName,
                    interpretationMode: heightConfig.interpretationMode,
                    applyToAllLayers: true,
                    savePreference: false // Already saved if requested
                  });
                } else {
                  setLayerSelectionOpen(false);
                  toast({
                    title: "Error",
                    description: "Current layer height configuration not found",
                    variant: "destructive"
                  });
                }
              }}
            >
              Apply to Selected Layers
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
          featureCollection={featureCollection as FeatureCollection}
          onHeightSourceSelect={handleHeightSourceSelect}
        />
      )}

      {/* Multi-layer Selection Alert */}
      <Alert
        className={`fixed bottom-4 right-4 w-96 z-50 border rounded-md shadow-lg ${
          showHeightUpdateAlert ? 'block' : 'hidden'
        }`}
      >
        <div className="flex justify-between items-start">
          <div className="flex">
            <Box className="h-4 w-4 mt-0.5 mr-2" />
            <div>
              <AlertTitle>Apply height to multiple layers</AlertTitle>
              <AlertDescription className="mt-1">
                Select which layers should receive this height configuration
              </AlertDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHeightUpdateAlert(false)}
            className="-mt-1 -mr-1 h-7 w-7"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 mb-2">
          <div className="flex justify-between mb-2 text-xs text-muted-foreground">
            <div>Compatible layers</div>
            <div className="space-x-2">
              <button 
                className="underline hover:text-foreground" 
                onClick={() => handleSelectAllLayers(true)}
              >
                Select all
              </button>
              <button 
                className="underline hover:text-foreground" 
                onClick={() => handleSelectAllLayers(false)}
              >
                Deselect all
              </button>
            </div>
          </div>

          <ScrollArea className="max-h-48 pr-2">
            <div className="space-y-2">
              {compatibleLayers.map(layer => (
                <div key={layer.id} className={`rounded border p-2 ${!layer.compatible ? 'bg-muted' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {layer.compatible ? (
                        <Checkbox 
                          id={`layer-${layer.id}`}
                          checked={selectedLayers[layer.id] || false}
                          onCheckedChange={(checked) => handleLayerSelectionToggle(layer.id, checked)}
                          disabled={!layer.compatible || layer.hasHeightConfig}
                        />
                      ) : (
                        <div className="h-4 w-4 flex items-center justify-center">❌</div>
                      )}
                      <label
                        htmlFor={`layer-${layer.id}`}
                        className={`text-sm ${!layer.compatible ? 'text-muted-foreground' : ''} ${
                          layer.hasHeightConfig ? 'line-through text-muted-foreground' : ''
                        }`}
                      >
                        {layer.name}
                      </label>
                    </div>
                    <div>
                      {layer.hasHeightConfig && (
                        <Badge variant="outline" className="text-xs">
                          Already configured
                        </Badge>
                      )}
                    </div>
                  </div>
                  {!layer.compatible && layer.reason && (
                    <div className="ml-6 text-xs text-muted-foreground mt-1">
                      {layer.reason}
                    </div>
                  )}
                </div>
              ))}
              {compatibleLayers.length === 0 && (
                <div className="text-sm text-muted-foreground p-2">
                  Checking for compatible layers...
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex justify-end space-x-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHeightUpdateAlert(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleApplyToSelectedLayers}
          >
            Apply
          </Button>
        </div>
      </Alert>
    </>
  );
} 
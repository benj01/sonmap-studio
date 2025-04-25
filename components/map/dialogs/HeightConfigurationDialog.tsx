'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogManager } from '@/core/logging/log-manager';
import { Feature, FeatureCollection, Geometry, Position, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection } from 'geojson';
import { Loader2, Info } from 'lucide-react';
import { usePreferenceStore } from '@/store/preference/userPreferenceStore';
import { CheckedState } from '@radix-ui/react-checkbox';
import { HeightTransformBatchService } from '../services/heightTransformBatchService';
import { HeightTransformProgress } from '../components/HeightTransformProgress';

interface HeightConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layerId: string;
  layerName: string;
  featureCollection: FeatureCollection;
  onHeightSourceSelect: (source: HeightSource) => void;
}

export interface HeightSource {
  type: 'z_coord' | 'attribute' | 'none';
  attributeName?: string;
  applyToAllLayers: boolean;
  savePreference: boolean;
  selectedLayerIds?: string[];
}

const SOURCE = 'HeightConfigurationDialog';
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

/**
 * Gets the first Z coordinate from a feature or null if none exists
 */
function getFeatureZCoordinate(feature: Feature): number | null {
  if (!feature.geometry) return null;
  
  try {
    switch (feature.geometry.type) {
      case 'Point': {
        const geometry = feature.geometry as Point;
        const coords = geometry.coordinates;
        return coords.length >= 3 ? coords[2] : null;
      }
      case 'LineString': {
        const geometry = feature.geometry as LineString;
        const coords = geometry.coordinates[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'Polygon': {
        const geometry = feature.geometry as Polygon;
        const coords = geometry.coordinates[0]?.[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'MultiPoint': {
        const geometry = feature.geometry as MultiPoint;
        const coords = geometry.coordinates[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'MultiLineString': {
        const geometry = feature.geometry as MultiLineString;
        const coords = geometry.coordinates[0]?.[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'MultiPolygon': {
        const geometry = feature.geometry as MultiPolygon;
        const coords = geometry.coordinates[0]?.[0]?.[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'GeometryCollection': {
        const geometryCollection = feature.geometry as GeometryCollection;
        if (geometryCollection.geometries && geometryCollection.geometries.length > 0) {
          const firstGeom = geometryCollection.geometries[0];
          if (firstGeom.type === 'Point') {
            const coords = (firstGeom as Point).coordinates;
            return coords.length >= 3 ? coords[2] : null;
          }
        }
        return null;
      }
      default:
        return null;
    }
  } catch (error) {
    console.error('Error extracting Z coordinate from feature', error);
    return null;
  }
}

/**
 * Detects if features have Z coordinates
 */
function detectZCoordinates(features: Feature[]): { 
  hasZ: boolean; 
  zCount: number; 
  totalCoords: number; 
  zMin: number; 
  zMax: number;
  message: string; 
} {
  if (!features || features.length === 0) {
    return { 
      hasZ: false, 
      zCount: 0,
      totalCoords: 0,
      zMin: 0,
      zMax: 0,
      message: 'No features found' 
    };
  }
  
  let zCount = 0;
  let zSum = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  let totalCoords = 0;
  
  // Function to process coordinates recursively
  const processCoords = (coords: any[]) => {
    if (!Array.isArray(coords)) return;
    
    if (coords.length >= 3 && typeof coords[2] === 'number') {
      // This is a coordinate with Z value
      const z = coords[2];
      if (!isNaN(z)) {
        zCount++;
        zSum += z;
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
      }
      totalCoords++;
    } else if (Array.isArray(coords[0])) {
      // This is a nested array of coordinates
      coords.forEach(c => processCoords(c));
    }
  };
  
  // Process all features
  features.forEach(feature => {
    if (!feature.geometry) return;
    
    try {
      switch (feature.geometry.type) {
        case 'Point': {
          const geometry = feature.geometry as Point;
          processCoords(geometry.coordinates);
          break;
        }
        case 'LineString': {
          const geometry = feature.geometry as LineString;
          processCoords(geometry.coordinates);
          break;
        }
        case 'Polygon': {
          const geometry = feature.geometry as Polygon;
          processCoords(geometry.coordinates);
          break;
        }
        case 'MultiPoint': {
          const geometry = feature.geometry as MultiPoint;
          processCoords(geometry.coordinates);
          break;
        }
        case 'MultiLineString': {
          const geometry = feature.geometry as MultiLineString;
          processCoords(geometry.coordinates);
          break;
        }
        case 'MultiPolygon': {
          const geometry = feature.geometry as MultiPolygon;
          processCoords(geometry.coordinates);
          break;
        }
        case 'GeometryCollection': {
          const geometryCollection = feature.geometry as GeometryCollection;
          if (geometryCollection.geometries) {
            geometryCollection.geometries.forEach(geom => {
              if (geom.type === 'Point') {
                processCoords((geom as Point).coordinates);
              } else if (geom.type === 'LineString') {
                processCoords((geom as LineString).coordinates);
              } else if (geom.type === 'Polygon') {
                processCoords((geom as Polygon).coordinates);
              } else if (geom.type === 'MultiPoint') {
                processCoords((geom as MultiPoint).coordinates);
              } else if (geom.type === 'MultiLineString') {
                processCoords((geom as MultiLineString).coordinates);
              } else if (geom.type === 'MultiPolygon') {
                processCoords((geom as MultiPolygon).coordinates);
              }
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error processing geometry coordinates', error);
    }
  });
  
  // No Z coordinates found
  if (zCount === 0) {
    return { 
      hasZ: false, 
      zCount: 0,
      totalCoords,
      zMin,
      zMax,
      message: 'No Z coordinates found' 
    };
  }
  
  // Analyze results
  const hasNonZeroZ = zMin !== 0 || zMax !== 0;
  const hasReasonableRange = zMin >= -100 && zMax <= 4000;
  const hasSufficientData = zCount > 0 && zCount >= 0.5 * totalCoords;
  
  if (!hasNonZeroZ) {
    return { 
      hasZ: false,
      zCount,
      totalCoords,
      zMin,
      zMax,
      message: 'All Z coordinates are zero'
    };
  } else if (!hasReasonableRange) {
    return { 
      hasZ: false,
      zCount,
      totalCoords,
      zMin,
      zMax,
      message: `Z values outside reasonable range (${zMin.toFixed(1)} to ${zMax.toFixed(1)})`
    };
  } else if (!hasSufficientData) {
    return { 
      hasZ: false,
      zCount,
      totalCoords,
      zMin,
      zMax,
      message: `Limited Z data (${zCount} of ${totalCoords} coordinates)`
    };
  }
  
  return { 
    hasZ: true,
    zCount,
    totalCoords,
    zMin,
    zMax,
    message: `${zCount} coordinates with Z values (range: ${zMin.toFixed(1)} to ${zMax.toFixed(1)})`
  };
}

/**
 * Detects numeric attributes that could be used for height values
 */
function detectNumericAttributes(features: Feature[]): {
  attributes: { name: string; min: number; max: number; count: number }[];
  message: string;
} {
  if (!features || features.length === 0) {
    return { attributes: [], message: 'No features found' };
  }
  
  const attributeStats: Record<string, { min: number; max: number; count: number; valid: boolean }> = {};
  
  // Collect all numeric attributes and their ranges
  features.forEach(feature => {
    if (!feature.properties) return;
    
    // Analyze each property
    Object.entries(feature.properties).forEach(([key, value]) => {
      // Skip LV95 coordinates (these are already processed)
      if (key.startsWith('lv95_')) return;

      // Try to convert value to number
      const numValue = typeof value === 'number' ? value : 
                      typeof value === 'string' ? parseFloat(value) : NaN;
      
      if (!isNaN(numValue)) {
        if (!attributeStats[key]) {
          attributeStats[key] = { min: numValue, max: numValue, count: 1, valid: true };
        } else {
          attributeStats[key].min = Math.min(attributeStats[key].min, numValue);
          attributeStats[key].max = Math.max(attributeStats[key].max, numValue);
          attributeStats[key].count++;
        }
      }
    });
  });
  
  // Filter attributes with reasonable height ranges and sufficient data
  const validAttributes = Object.entries(attributeStats)
    .filter(([_, stats]) => 
      stats.min >= -100 && stats.max <= 4000 && // Reasonable height range
      stats.count >= 0.5 * features.length      // Present in at least half the features
    )
    .map(([name, stats]) => ({
      name,
      min: stats.min,
      max: stats.max,
      count: stats.count
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  
  return {
    attributes: validAttributes,
    message: validAttributes.length > 0 
      ? `Found ${validAttributes.length} potential height attributes` 
      : 'No suitable height attributes found'
  };
}

/**
 * Gets a preview of height values for a sample of features
 */
function getHeightPreview(features: Feature[], source: string, maxSamples: number = 5): {
  featureId: string | number;
  value: number | null;
}[] {
  if (!features.length) return [];

  // Take a sample of features for preview
  const sampleSize = Math.min(features.length, maxSamples);
  const sampleFeatures = features.slice(0, sampleSize);
  
  // Extract height data based on source
  return sampleFeatures.map(feature => {
    let value: number | null = null;
    
    if (source === 'z_coord') {
      value = getFeatureZCoordinate(feature);
    } else if (source && feature.properties && typeof feature.properties[source] === 'number') {
      value = feature.properties[source] as number;
    }
    
    return {
      featureId: feature.id || feature.properties?.id || `feature-${sampleFeatures.indexOf(feature)}`,
      value
    };
  });
}

export function HeightConfigurationDialog({
  open,
  onOpenChange,
  layerId,
  layerName,
  featureCollection,
  onHeightSourceSelect
}: HeightConfigurationDialogProps) {
  // State for source type selection (z-coord, attribute, or none)
  const [sourceType, setSourceType] = useState<'z_coord' | 'attribute' | 'none'>('none');
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  const [numericAttributes, setNumericAttributes] = useState<{ name: string; min: number; max: number; count: number }[]>([]);
  const [zCoordinateInfo, setZCoordinateInfo] = useState<{ hasZ: boolean; message: string }>({ hasZ: false, message: '' });
  const [applyToAllLayers, setApplyToAllLayers] = useState<boolean>(false);
  const [savePreference, setSavePreference] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [heightPreview, setHeightPreview] = useState<{ featureId: string | number; value: number | null }[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>('z_coord');
  
  // New state for batch processing
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState<boolean>(false);
  
  // Preference store for saving user preferences
  const { preferences, setHeightSourcePreference } = usePreferenceStore();
  const heightSourcePreference = preferences.heightSourcePreference;
  
  // Batch service instance
  const batchService = HeightTransformBatchService.getInstance();
  
  // Detect Z coordinates and numeric attributes on mount and when featureCollection changes
  useEffect(() => {
    if (featureCollection && featureCollection.features) {
      // Detect if features have Z coordinates
      const zInfo = detectZCoordinates(featureCollection.features);
      setZCoordinateInfo({
        hasZ: zInfo.hasZ,
        message: zInfo.message
      });
      
      // Detect numeric attributes in feature properties
      const attrInfo = detectNumericAttributes(featureCollection.features);
      setNumericAttributes(attrInfo.attributes);
      
      // Set default source type based on what's available
      if (zInfo.hasZ) {
        setSourceType('z_coord');
        setSelectedTab('z_coord');
      } else if (attrInfo.attributes.length > 0) {
        setSourceType('attribute');
        setSelectedAttribute(attrInfo.attributes[0].name);
        setSelectedTab('attribute');
      } else {
        setSourceType('none');
        setSelectedTab('none');
      }
      
      // Apply preference if available
      if (heightSourcePreference) {
        if (heightSourcePreference.type === 'attribute') {
          // Only apply attribute preference if this layer has that attribute
          const hasAttribute = attrInfo.attributes.some(attr => 
            attr.name === heightSourcePreference.attributeName
          );
          
          if (hasAttribute) {
            setSourceType('attribute');
            setSelectedAttribute(heightSourcePreference.attributeName || '');
            setSelectedTab('attribute');
          }
        } else if (heightSourcePreference.type === 'z_coord' && zInfo.hasZ) {
          setSourceType('z_coord');
          setSelectedTab('z_coord');
        } else if (heightSourcePreference.type === 'none') {
          setSourceType('none');
          setSelectedTab('none');
        }
        
        setSavePreference(true);
      }
    }
  }, [featureCollection, heightSourcePreference]);
  
  // Update preview when source type or selected attribute changes
  useEffect(() => {
    if (featureCollection && featureCollection.features) {
      if (sourceType === 'z_coord') {
        setHeightPreview(getHeightPreview(featureCollection.features, 'z_coord'));
      } else if (sourceType === 'attribute' && selectedAttribute) {
        setHeightPreview(getHeightPreview(featureCollection.features, selectedAttribute));
      } else {
        setHeightPreview([]);
      }
    }
  }, [featureCollection, sourceType, selectedAttribute]);
  
  // Handle tab change
  const handleTabChange = (value: string) => {
    setSelectedTab(value);
    setSourceType(value as 'z_coord' | 'attribute' | 'none');
    
    if (value === 'attribute' && numericAttributes.length > 0 && !selectedAttribute) {
      setSelectedAttribute(numericAttributes[0].name);
    }
  };
  
  // Handle attribute selection
  const handleAttributeSelect = (value: string) => {
    setSelectedAttribute(value);
  };
  
  // Handle apply to all layers change
  const handleApplyToAllLayersChange = (checked: CheckedState) => {
    setApplyToAllLayers(!!checked);
  };
  
  // Handle save preference change
  const handleSavePreferenceChange = (checked: CheckedState) => {
    setSavePreference(!!checked);
  };
  
  // Handle apply button click
  const handleApply = async () => {
    setIsLoading(true);
    
    try {
      // Create the height source configuration
      const heightSource: HeightSource = {
        type: sourceType,
        attributeName: sourceType === 'attribute' ? selectedAttribute : undefined,
        applyToAllLayers,
        savePreference,
      };
      
      // Save preference if requested
      if (savePreference) {
        setHeightSourcePreference({
          type: sourceType,
          attributeName: sourceType === 'attribute' ? selectedAttribute : undefined
        });
      }
      
      // Always notify parent about height source selection, even if no batch processing needed
      onHeightSourceSelect(heightSource);

      // Skip batch processing for 'none' height source type
      if (sourceType === 'none') {
        onOpenChange(false);
        return;
      }
      
      // Check if there are features to process
      if (!featureCollection.features || featureCollection.features.length === 0) {
        logger.warn('No features available to process', { layerId });
        // Show a brief message and close the dialog
        setIsLoading(false);
        onOpenChange(false);
        return;
      }
      
      // Initialize a batch for processing
      const batchId = await batchService.initializeBatch(
        layerId,
        sourceType,
        sourceType === 'attribute' ? selectedAttribute : undefined
      );
      
      if (batchId === 'NO_FEATURES') {
        // Special case: No features found in the database
        logger.warn('No features found in database for layer', { layerId });
        onOpenChange(false);
        return;
      } else if (batchId) {
        setActiveBatchId(batchId);
        
        // Start batch processing
        const started = await batchService.startBatchProcessing(
          batchId,
          featureCollection,
          { chunkSize: 50 }
        );
        
        if (started) {
          setShowProgress(true);
        } else {
          logger.error('Failed to start batch processing', { batchId, layerId });
          setActiveBatchId(null);
          onOpenChange(false);
        }
      } else {
        logger.error('Failed to initialize batch', { layerId });
        onOpenChange(false);
      }
    } catch (error) {
      logger.error('Error applying height source', error);
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleProgressComplete = () => {
    setShowProgress(false);
    setActiveBatchId(null);
    onOpenChange(false);
  };
  
  const handleProgressCancel = () => {
    setShowProgress(false);
    // The batch has already been cancelled in the progress component
    setActiveBatchId(null);
  };
  
  // Content rendered when progress is showing
  const renderProgressContent = () => {
    if (!activeBatchId) return null;
    
    return (
      <div className="flex justify-center items-center p-4">
        <HeightTransformProgress
          batchId={activeBatchId}
          layerName={layerName}
          onComplete={handleProgressComplete}
          onCancel={handleProgressCancel}
        />
      </div>
    );
  };
  
  // Content rendered for height configuration options
  const renderConfigContent = () => {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Configure Height Source</DialogTitle>
          <DialogDescription>
            Choose how height values should be determined for 3D visualization
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={selectedTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="z_coord" disabled={!zCoordinateInfo.hasZ}>
              Z Coordinates
            </TabsTrigger>
            <TabsTrigger value="attribute" disabled={numericAttributes.length === 0}>
              Attribute
            </TabsTrigger>
            <TabsTrigger value="none">
              No Height
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="z_coord" className="space-y-4">
            <div className="text-sm">
              Use Z coordinates from the geometry for height values.
              
              {!zCoordinateInfo.hasZ && (
                <div className="text-amber-600 mt-2 flex items-center">
                  <Info className="h-4 w-4 mr-1" />
                  No valid Z coordinates detected in this layer.
                </div>
              )}
              
              {zCoordinateInfo.hasZ && (
                <div className="text-green-600 mt-2">
                  Z coordinates detected and will be used for heights.
                </div>
              )}
            </div>
            
            {heightPreview.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Preview:</h4>
                <div className="text-xs grid grid-cols-2 gap-x-4 gap-y-1">
                  {heightPreview.map(item => (
                    <div key={`${item.featureId}`} className="flex justify-between">
                      <span className="text-muted-foreground truncate">{item.featureId}</span>
                      <span>{item.value !== null ? `${item.value.toFixed(2)}m` : 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="attribute" className="space-y-4">
            <div className="space-y-4">
              <div className="text-sm">
                Use a numeric attribute from feature properties for height values.
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="attribute-select">Height Attribute</Label>
                <Select value={selectedAttribute} onValueChange={handleAttributeSelect}>
                  <SelectTrigger id="attribute-select">
                    <SelectValue placeholder="Select attribute" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericAttributes.map(attr => (
                      <SelectItem key={attr.name} value={attr.name}>
                        {attr.name} ({attr.min.toFixed(1)} - {attr.max.toFixed(1)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {heightPreview.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Preview:</h4>
                  <div className="text-xs grid grid-cols-2 gap-x-4 gap-y-1">
                    {heightPreview.map(item => (
                      <div key={`${item.featureId}`} className="flex justify-between">
                        <span className="text-muted-foreground truncate">{item.featureId}</span>
                        <span>{item.value !== null ? `${item.value.toFixed(2)}m` : 'N/A'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="none" className="space-y-4">
            <div className="text-sm">
              Features will be displayed flat without height information.
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="space-y-2 mt-6">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="apply-all" 
              checked={applyToAllLayers}
              onCheckedChange={handleApplyToAllLayersChange}
            />
            <label
              htmlFor="apply-all"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Apply to all compatible layers
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="save-preference" 
              checked={savePreference}
              onCheckedChange={handleSavePreferenceChange}
            />
            <label
              htmlFor="save-preference"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Save as preference for future layers
            </label>
          </div>
        </div>
        
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </>
    );
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {showProgress ? renderProgressContent() : renderConfigContent()}
      </DialogContent>
    </Dialog>
  );
} 
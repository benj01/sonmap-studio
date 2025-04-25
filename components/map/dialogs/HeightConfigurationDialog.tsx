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
  const [selectedHeightSource, setSelectedHeightSource] = useState<'z_coord' | 'attribute' | 'none'>('none');
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  const [applyToAllLayers, setApplyToAllLayers] = useState(false);
  const [layerSelectionOpen, setLayerSelectionOpen] = useState(false);
  const [savePreference, setSavePreference] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zInfo, setZInfo] = useState<ReturnType<typeof detectZCoordinates> | null>(null);
  const [attributeInfo, setAttributeInfo] = useState<ReturnType<typeof detectNumericAttributes> | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof getHeightPreview>>([]);
  
  // Get saved preferences from the store
  const heightSourcePreference = usePreferenceStore(state => state.preferences.heightSourcePreference);
  
  // Flag to track if a preference has been found and can be applied
  const [preferenceApplied, setPreferenceApplied] = useState(false);

  // Analyze features when the dialog opens
  useEffect(() => {
    if (open && featureCollection && featureCollection.features) {
      setLoading(true);
      
      try {
        // Detect Z coordinates
        const zData = detectZCoordinates(featureCollection.features);
        setZInfo(zData);
        
        // Detect numeric attributes
        const attrData = detectNumericAttributes(featureCollection.features);
        setAttributeInfo(attrData);
        
        // Try to apply saved preference if it exists and is applicable
        if (heightSourcePreference && !preferenceApplied) {
          logger.info('Attempting to apply saved height source preference', heightSourcePreference);
          
          // Check if the preferred source is available
          let canApplyPreference = false;
          
          if (heightSourcePreference.type === 'z_coord' && zData.hasZ) {
            setSelectedHeightSource('z_coord');
            canApplyPreference = true;
          } else if (heightSourcePreference.type === 'attribute' && 
                     heightSourcePreference.attributeName && 
                     attrData.attributes.some(attr => attr.name === heightSourcePreference.attributeName)) {
            setSelectedHeightSource('attribute');
            setSelectedAttribute(heightSourcePreference.attributeName);
            canApplyPreference = true;
          } else if (heightSourcePreference.type === 'none') {
            setSelectedHeightSource('none');
            canApplyPreference = true;
          }
          
          if (canApplyPreference) {
            logger.info('Applied saved height source preference', {
              type: heightSourcePreference.type,
              attributeName: heightSourcePreference.attributeName
            });
            setPreferenceApplied(true);
            // When a preference is applied, suggest saving it as well
            setSavePreference(true);
          } else {
            logger.info('Could not apply saved preference - using detection instead', {
              preferenceType: heightSourcePreference.type,
              hasZ: zData.hasZ,
              attrCount: attrData.attributes.length
            });
          }
        }
        
        // If no preference was applied or it couldn't be applied,
        // set default height source type based on what's available
        if (!preferenceApplied) {
          if (zData.hasZ) {
            setSelectedHeightSource('z_coord');
            // Set preview for Z coordinates
            setPreview(getHeightPreview(featureCollection.features, 'z_coord'));
          } else if (attrData.attributes.length > 0) {
            setSelectedHeightSource('attribute');
            setSelectedAttribute(attrData.attributes[0].name);
            // Set preview for first attribute
            setPreview(getHeightPreview(featureCollection.features, attrData.attributes[0].name));
          } else {
            setSelectedHeightSource('none');
            setPreview([]);
          }
        }
      } catch (error) {
        logger.error('Error analyzing features', error);
      } finally {
        setLoading(false);
      }
    }
  }, [open, featureCollection, heightSourcePreference, preferenceApplied]);

  // Update preview when height source changes
  useEffect(() => {
    if (featureCollection && featureCollection.features) {
      if (selectedHeightSource === 'z_coord') {
        setPreview(getHeightPreview(featureCollection.features, 'z_coord'));
      } else if (selectedHeightSource === 'attribute' && selectedAttribute) {
        setPreview(getHeightPreview(featureCollection.features, selectedAttribute));
      } else {
        setPreview([]);
      }
    }
  }, [selectedHeightSource, selectedAttribute, featureCollection]);

  // Reset settings when dialog is closed
  useEffect(() => {
    if (!open) {
      setPreferenceApplied(false); // Reset preference applied flag
    }
  }, [open]);

  // Toggle apply to all layers and layer selection panel
  const handleApplyToAllLayersChange = (checked: CheckedState) => {
    setApplyToAllLayers(checked === true);
    if (checked === true) {
      setLayerSelectionOpen(true);
    } else {
      setLayerSelectionOpen(false);
    }
  };

  const handleApply = () => {
    const heightSource: HeightSource = {
      type: selectedHeightSource,
      applyToAllLayers,
      savePreference,
    };

    if (selectedHeightSource === 'attribute' && selectedAttribute) {
      heightSource.attributeName = selectedAttribute;
    }

    logger.info('Applying height source', heightSource);
    onHeightSourceSelect(heightSource);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Height Configuration</DialogTitle>
          <DialogDescription>
            Configure height data for 3D visualization of {layerName}
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Analyzing features...</span>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Select height data source:</h3>
              
              <RadioGroup 
                value={selectedHeightSource} 
                onValueChange={(value) => setSelectedHeightSource(value as 'z_coord' | 'attribute' | 'none')}
                className="space-y-3"
              >
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="z_coord" id="z_coord" disabled={!zInfo?.hasZ} />
                  <div className="grid gap-1.5">
                    <Label htmlFor="z_coord" className={!zInfo?.hasZ ? "text-gray-400" : ""}>
                      Use Z coordinates
                      {zInfo?.hasZ && (
                        <span className="ml-2 text-xs text-green-600 font-medium">
                          (Recommended)
                        </span>
                      )}
                    </Label>
                    <p className="text-sm text-gray-500">
                      {zInfo?.message || "No Z coordinate information available"}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-2">
                  <RadioGroupItem 
                    value="attribute" 
                    id="attribute" 
                    disabled={!attributeInfo?.attributes.length} 
                  />
                  <div className="grid gap-1.5 w-full">
                    <Label 
                      htmlFor="attribute" 
                      className={!attributeInfo?.attributes.length ? "text-gray-400" : ""}
                    >
                      Use attribute field
                    </Label>
                    {selectedHeightSource === "attribute" && attributeInfo?.attributes.length ? (
                      <Select 
                        value={selectedAttribute} 
                        onValueChange={setSelectedAttribute}
                        disabled={!attributeInfo?.attributes.length}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select attribute" />
                        </SelectTrigger>
                        <SelectContent>
                          {attributeInfo?.attributes.map(attr => (
                            <SelectItem key={attr.name} value={attr.name}>
                              {attr.name} ({attr.min.toFixed(1)} to {attr.max.toFixed(1)} m)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-gray-500">
                        {attributeInfo?.message || "No attribute information available"}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="none" id="none" />
                  <div className="grid gap-1.5">
                    <Label htmlFor="none">No height data</Label>
                    <p className="text-sm text-gray-500">
                      Features will be displayed without elevation (flat)
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
            
            {/* Preview section */}
            {selectedHeightSource !== 'none' && preview.length > 0 && (
              <div className="border rounded-md p-3 bg-gray-50">
                <h4 className="text-sm font-medium mb-2">
                  Preview 
                  <span className="text-xs text-gray-500 ml-1">
                    (first {preview.length} features)
                  </span>
                </h4>
                <div className="space-y-1">
                  {preview.map(item => (
                    <div key={item.featureId} className="grid grid-cols-2 text-sm">
                      <span className="text-gray-500">Feature #{item.featureId}</span>
                      <span>
                        {item.value !== null 
                          ? `${item.value.toFixed(2)} m` 
                          : <span className="text-gray-400">No value</span>
                        }
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Options section */}
            <div className="space-y-3 pt-2">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="apply-all-layers" 
                    checked={applyToAllLayers} 
                    onCheckedChange={handleApplyToAllLayersChange} 
                  />
                  <Label htmlFor="apply-all-layers" className="font-normal cursor-pointer">
                    Apply to compatible layers
                  </Label>
                </div>
                {layerSelectionOpen && (
                  <div className="ml-6 mt-2 text-sm text-muted-foreground">
                    When checked, this configuration will be applied to other layers with compatible data structure.
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="save-preference" 
                  checked={savePreference} 
                  onCheckedChange={(checked: CheckedState) => setSavePreference(checked === true)} 
                />
                <Label htmlFor="save-preference" className="font-normal cursor-pointer">
                  Save preference for future imports
                </Label>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex">
              <Info className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p>Height transformation will convert LV95 coordinates to WGS84 ellipsoidal heights for accurate 3D visualization.</p>
                <p className="mt-1">This process uses the SwissTopo API and might take some time for large datasets.</p>
              </div>
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 
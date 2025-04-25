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
  // Primary mode - now only advanced is supported
  mode: 'advanced';
  
  // Simple mode fields kept for backward compatibility
  type?: 'z_coord' | 'attribute' | 'none';
  attributeName?: string;
  interpretationMode?: 'absolute' | 'relative' | 'extrusion';
  
  // Advanced mode
  advanced?: {
    baseElevation: {
      source: 'z_coord' | 'attribute' | 'terrain';
      attributeName?: string;
      isAbsolute: boolean;
    };
    heightConfig: {
      source: 'attribute' | 'calculated' | 'none';
      attributeName?: string;
      isRelative: boolean;
    };
    visualization: {
      type: 'extrusion' | 'point_elevation' | 'line_elevation';
      extrudedFaces?: boolean;
      extrudedTop?: boolean;
    };
  };
  
  // Swiss height transformation options
  swissHeightTransformation?: {
    enabled: boolean;
    transformationMethod: 'api' | 'delta';
    cacheResults: boolean;
  };
  
  // Common options
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
  // First check for LV95 stored heights - this takes priority
  if (feature.properties?.height_mode === 'lv95_stored') {
    // Check for lv95_height property first
    if (typeof feature.properties.lv95_height === 'number' && 
        !isNaN(feature.properties.lv95_height)) {
      return feature.properties.lv95_height;
    }
    
    // Fallback to height property if present
    if (typeof feature.properties.height === 'number' && 
        !isNaN(feature.properties.height)) {
      return feature.properties.height;
    }
    
    // Fallback to base_elevation_ellipsoidal if present
    if (typeof feature.properties.base_elevation_ellipsoidal === 'number' && 
        !isNaN(feature.properties.base_elevation_ellipsoidal)) {
      return feature.properties.base_elevation_ellipsoidal;
    }
  }
  
  // Then check for direct Z coordinates in the geometry
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
  let lv95StoredCount = 0;
  
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
    // Check if feature has the LV95 stored height mode
    if (feature.properties?.height_mode === 'lv95_stored') {
      // This is a feature with LV95 stored height data
      lv95StoredCount++;
      
      // Extract height from lv95_height property
      if (feature.properties.lv95_height !== undefined && 
          typeof feature.properties.lv95_height === 'number') {
        const z = feature.properties.lv95_height;
        if (!isNaN(z)) {
          zCount++;
          zSum += z;
          zMin = Math.min(zMin, z);
          zMax = Math.max(zMax, z);
        }
        totalCoords++;
      }
    }
    
    // Also check the geometry for Z coordinates
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
  
  // If we have LV95 stored heights but no coordinate counts, ensure we have at least the count of features with LV95 stored heights
  if (lv95StoredCount > 0 && totalCoords === 0) {
    totalCoords = lv95StoredCount;
    logger.debug('Using LV95 stored feature count for total coordinates', { lv95StoredCount });
  }
  
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
  
  // Special case for LV95 stored heights
  if (lv95StoredCount > 0) {
    return { 
      hasZ: true,
      zCount,
      totalCoords,
      zMin,
      zMax,
      message: `${zCount} coordinates with Z values (range: ${zMin.toFixed(1)} to ${zMax.toFixed(1)}) from LV95 stored height data`
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
    
    // Check if this feature has LV95 stored height data
    const isLv95Stored = feature.properties.height_mode === 'lv95_stored';
    
    // Analyze each property
    Object.entries(feature.properties).forEach(([key, value]) => {
      // Skip known non-attribute values
      if (key === 'id' || key === 'layer_id' || key === 'geometry_type') return;
      
      // Skip LV95 coordinates (these are treated as Z coordinates)
      if (key === 'lv95_easting' || key === 'lv95_northing' || key === 'lv95_height') return;
      
      // Skip height_mode and related properties
      if (key === 'height_mode' || 
          key === 'height_source' || 
          key === 'height_transformation_status' ||
          key === 'vertical_datum_source') return;
      
      // If this is an LV95 stored feature, skip height values that should be considered Z coordinates
      if (isLv95Stored && (key === 'height' || key === 'base_elevation_ellipsoidal')) return;

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
      // Use our comprehensive Z coordinate extraction function
      value = getFeatureZCoordinate(feature);
    } else if (source && feature.properties) {
      // For attribute source, get the property value
      if (typeof feature.properties[source] === 'number') {
        value = feature.properties[source] as number;
      } else if (typeof feature.properties[source] === 'string') {
        const parsedValue = parseFloat(feature.properties[source] as string);
        if (!isNaN(parsedValue)) {
          value = parsedValue;
        }
      }
    }
    
    return {
      featureId: feature.id || feature.properties?.id || `feature-${sampleFeatures.indexOf(feature)}`,
      value
    };
  });
}

/**
 * Detects if features use Swiss coordinates
 */
function detectSwissCoordinates(features: Feature[]): { 
  isSwiss: boolean;
  hasLv95Stored: boolean;
  hasSwissVerticalDatum: boolean;
  message: string;
} {
  if (!features || features.length === 0) {
    return { 
      isSwiss: false,
      hasLv95Stored: false,
      hasSwissVerticalDatum: false,
      message: 'No features found' 
    };
  }
  
  // Check for 'lv95_stored' height mode
  const hasLv95Stored = features.some(f => 
    f.properties?.height_mode === 'lv95_stored'
  );
  
  // Check for lv95 properties
  const hasLv95Properties = features.some(f => 
    f.properties && 
    (f.properties.lv95_easting !== undefined || 
     f.properties.lv95_northing !== undefined || 
     f.properties.lv95_height !== undefined)
  );
  
  // Check for Swiss vertical datum
  const hasSwissVerticalDatum = features.some(f => 
    f.properties?.vertical_datum_source === 'LHN95'
  );
  
  // Check for Swiss coordinate ranges (if no other indicators are found)
  let hasSwissCoordinateRange = false;
  if (!hasLv95Stored && !hasSwissVerticalDatum && !hasLv95Properties) {
    hasSwissCoordinateRange = features.some(feature => {
      if (feature.geometry?.type === 'Point') {
        const coords = (feature.geometry as Point).coordinates;
        // Check for typical Swiss LV95 coordinate ranges
        return (
          coords[0] > 2000000 && coords[0] < 3000000 &&
          coords[1] > 1000000 && coords[1] < 2000000
        );
      }
      return false;
    });
  }
  
  const isSwiss = hasLv95Stored || hasSwissVerticalDatum || hasLv95Properties || hasSwissCoordinateRange;
  
  let message = 'No Swiss coordinates detected';
  if (isSwiss) {
    if (hasLv95Stored) {
      message = 'Swiss coordinates with stored LV95 values detected';
    } else if (hasLv95Properties) {
      message = 'Swiss LV95 properties detected';
    } else if (hasSwissVerticalDatum) {
      message = 'Swiss height datum (LHN95) detected';
    } else {
      message = 'Coordinates in Swiss range detected';
    }
  }
  
  return { 
    isSwiss,
    hasLv95Stored: hasLv95Stored || hasLv95Properties,
    hasSwissVerticalDatum,
    message
  };
}

/**
 * Component for Swiss height transformation settings
 */
function SwissHeightTransformationSettings({ 
  showSwissOptions,
  settings,
  onSettingsChange
}: { 
  showSwissOptions: boolean;
  settings: HeightSource['swissHeightTransformation'];
  onSettingsChange: (settings: HeightSource['swissHeightTransformation']) => void;
}) {
  if (!showSwissOptions) return null;
  
  // Initialize with default settings if none exist
  const currentSettings = settings || {
    enabled: false,
    transformationMethod: 'api' as const,
    cacheResults: true
  };
  
  return (
    <div className="p-4 border rounded-md mt-4">
      <h3 className="text-lg font-medium mb-2">Swiss Height Transformation</h3>
      <div className="space-y-4">
        <div className="flex items-center">
          <Checkbox
            id="enable-swiss-transform"
            checked={currentSettings.enabled}
            onCheckedChange={(checked) => onSettingsChange({
              ...currentSettings,
              enabled: !!checked
            })}
          />
          <Label htmlFor="enable-swiss-transform" className="ml-2 text-sm">
            Use Swiss Reframe API for precise height transformation
          </Label>
        </div>
        
        {currentSettings.enabled && (
          <>
            <div className="ml-6 space-y-2">
              <div className="text-xs text-gray-600 mb-2">
                Required for accurate visualization of Swiss LV95 coordinates in 3D.
                The transformation will be performed once when you apply these settings.
              </div>
              
              <RadioGroup
                value={currentSettings.transformationMethod}
                onValueChange={(value) => onSettingsChange({
                  ...currentSettings,
                  transformationMethod: value as 'api' | 'delta'
                })}
                className="flex flex-col space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="api" id="transform-api" />
                  <Label htmlFor="transform-api" className="font-normal">
                    Direct API calls
                    <p className="text-xs text-muted-foreground">
                      Highest precision, uses individual API calls for each coordinate
                    </p>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="delta" id="transform-delta" />
                  <Label htmlFor="transform-delta" className="font-normal">
                    Delta-based calculation
                    <p className="text-xs text-muted-foreground">
                      Faster for large datasets, calculates heights based on reference points
                    </p>
                  </Label>
                </div>
              </RadioGroup>
              
              <div className="flex items-center mt-2">
                <Checkbox
                  id="cache-results"
                  checked={currentSettings.cacheResults}
                  onCheckedChange={(checked) => onSettingsChange({
                    ...currentSettings,
                    cacheResults: !!checked
                  })}
                />
                <Label htmlFor="cache-results" className="ml-2 text-sm">
                  Cache transformation results
                  <p className="text-xs text-muted-foreground">
                    Improves performance for future transformations in the same area
                  </p>
                </Label>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function HeightConfigurationDialog({
  open,
  onOpenChange,
  layerId,
  layerName,
  featureCollection,
  onHeightSourceSelect
}: HeightConfigurationDialogProps) {
  // Configuration mode - now fixed to 'advanced'
  
  // Source type state (maintaining for backward compatibility)
  const [sourceType, setSourceType] = useState<'z_coord' | 'attribute' | 'none'>('z_coord');
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  const [interpretationMode, setInterpretationMode] = useState<'absolute' | 'relative' | 'extrusion'>('absolute');
  
  // Advanced configuration state with default values
  const [advancedConfig, setAdvancedConfig] = useState<NonNullable<HeightSource['advanced']>>({
    baseElevation: {
      source: 'terrain',
      attributeName: '',
      isAbsolute: false
    },
    heightConfig: {
      source: 'none',
      attributeName: '',
      isRelative: false
    },
    visualization: {
      type: 'extrusion',
      extrudedFaces: true,
      extrudedTop: true
    }
  });
  
  // Swiss coordinates state
  const [swissCoordinatesInfo, setSwissCoordinatesInfo] = useState<ReturnType<typeof detectSwissCoordinates>>({
    isSwiss: false,
    hasLv95Stored: false,
    hasSwissVerticalDatum: false,
    message: ''
  });
  
  // Swiss height transformation settings
  const [swissHeightSettings, setSwissHeightSettings] = useState<HeightSource['swissHeightTransformation']>({
    enabled: false,
    transformationMethod: 'api',
    cacheResults: true
  });
  
  // Common options
  const [applyToAllLayers, setApplyToAllLayers] = useState<boolean>(false);
  const [savePreference, setSavePreference] = useState<boolean>(false);
  
  // Tab state - default to 'base' for advanced mode
  const [activeTab, setActiveTab] = useState<string>('base');
  
  // Processing state
  const [showProgress, setShowProgress] = useState<boolean>(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  
  // Features analysis
  const [zCoordinatesInfo, setZCoordinatesInfo] = useState<ReturnType<typeof detectZCoordinates>>({
    hasZ: false,
    zCount: 0,
    totalCoords: 0,
    zMin: 0,
    zMax: 0,
    message: ''
  });
  
  const [numericAttributesInfo, setNumericAttributesInfo] = useState<ReturnType<typeof detectNumericAttributes>>({
    attributes: [],
    message: ''
  });
  
  const [heightPreview, setHeightPreview] = useState<ReturnType<typeof getHeightPreview>>([]);
  
  // Get preferences
  const { preferences, setHeightSourcePreference } = usePreferenceStore();
  
  // Batch service instance
  const batchService = HeightTransformBatchService.getInstance();
  
  useEffect(() => {
    // Analyze features when they change
    const features = featureCollection?.features || [];
    if (features.length > 0) {
      // First detect Swiss coordinates
      const swissInfo = detectSwissCoordinates(features);
      setSwissCoordinatesInfo(swissInfo);
      logger.debug('Swiss coordinates detection results', { swissInfo });
      
      // Calculate Z-coordinate info
      const zInfo = detectZCoordinates(features);
      setZCoordinatesInfo(zInfo);
      logger.debug('Z-coordinate detection results', { zInfo });
      
      // Calculate numeric attributes info
      const attributesInfo = detectNumericAttributes(features);
      setNumericAttributesInfo(attributesInfo);
      logger.debug('Numeric attributes detection results', { attributesInfo });
      
      // Set default source type based on detection results
      // We still need this for backward compatibility
      let initialSourceType: 'z_coord' | 'attribute' | 'none' = 'none';
      
      // Prioritize Z coordinates, especially if LV95 stored values are present
      if (zInfo.hasZ || (swissInfo.hasLv95Stored && swissInfo.isSwiss)) {
        initialSourceType = 'z_coord';
      } else if (attributesInfo.attributes.length > 0) {
        initialSourceType = 'attribute';
        // Set the first attribute as default
        if (!selectedAttribute && attributesInfo.attributes.length > 0) {
          setSelectedAttribute(attributesInfo.attributes[0].name);
        }
      }
      
      setSourceType(initialSourceType);
      
      // Configure advanced settings based on detection
      setAdvancedConfig(currentConfig => {
        const updatedConfig = {...currentConfig};
        
        if (zInfo.hasZ) {
          // If Z coordinates available, use them for base elevation
          updatedConfig.baseElevation.source = 'z_coord';
        } else if (attributesInfo.attributes.length > 0) {
          // If numeric attributes available, use the first one for height
          updatedConfig.heightConfig.source = 'attribute';
          updatedConfig.heightConfig.attributeName = attributesInfo.attributes[0].name;
        }
        
        return updatedConfig;
      });
      
      // Auto-enable Swiss height transformation if LV95 coordinates are stored
      if (swissInfo.hasLv95Stored) {
        setSwissHeightSettings({
          enabled: true,
          transformationMethod: 'api',
          cacheResults: true
        });
      }
    }
  }, [featureCollection, selectedAttribute]);
  
  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSourceType(value as 'z_coord' | 'attribute' | 'none');
    
    if (value === 'attribute' && numericAttributesInfo.attributes.length > 0 && !selectedAttribute) {
      setSelectedAttribute(numericAttributesInfo.attributes[0].name);
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
  
  // Handle Swiss height transformation settings change
  const handleSwissHeightSettingsChange = (settings: HeightSource['swissHeightTransformation']) => {
    setSwissHeightSettings(settings);
  };
  
  // Handle apply button click
  const handleApply = async () => {
    setShowProgress(true);
    
    try {
      // Gather the configuration based on current state
      let heightSource: HeightSource = {
        mode: 'advanced',
        applyToAllLayers,
        savePreference,
        swissHeightTransformation: swissHeightSettings,
        advanced: advancedConfig
      };
      
      // For backward compatibility, map advanced settings to simple mode fields
      if (advancedConfig.baseElevation.source === 'z_coord') {
        heightSource.type = 'z_coord';
      } else if (advancedConfig.heightConfig.source === 'attribute') {
        heightSource.type = 'attribute';
        heightSource.attributeName = advancedConfig.heightConfig.attributeName;
        heightSource.interpretationMode = advancedConfig.heightConfig.isRelative ? 'relative' : 'absolute';
      } else {
        heightSource.type = 'none';
      }
      
      // Save as preference if requested
      if (savePreference) {
        const preferenceSource = {
          type: heightSource.type as 'z_coord' | 'attribute' | 'none',
          attributeName: heightSource.attributeName,
          interpretationMode: heightSource.interpretationMode,
          mode: 'advanced' as const,
          advanced: advancedConfig
        };
        
        setHeightSourcePreference(preferenceSource);
        logger.info('Saved height source preference', { preferenceSource });
      }
      
      // Apply the height source (will handle batch processing if needed)
      onHeightSourceSelect(heightSource);
      
      // Initialize batch if needed (for z_coord or attribute types)
      if (heightSource.type !== 'none') {
        if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
          logger.warn('No features available to process', { layerId });
          setShowProgress(false);
          return;
        }
        
        logger.info('Initializing height transformation batch', { layerId, heightSource });
        
        const batchId = await batchService.initializeBatch(
          layerId,
          heightSource.type,
          heightSource.type === 'attribute' ? heightSource.attributeName : undefined
        );
        
        if (!batchId) {
          logger.error('Failed to initialize batch', { layerId });
          setShowProgress(false);
          return;
        }
        
        // Handle special case of no features
        if (batchId === 'NO_FEATURES') {
          logger.warn('No features found for transformation', { layerId });
          onOpenChange(false);
          return;
        }
        
        setBatchId(batchId);
        
        // Start batch processing with Swiss transformation options if enabled
        const success = await batchService.startBatchProcessing(
          batchId,
          featureCollection,
          {
            chunkSize: 50,
            swissTransformation: swissHeightSettings?.enabled ? {
              method: swissHeightSettings.transformationMethod,
              cache: swissHeightSettings.cacheResults
            } : undefined
          }
        );
        
        if (!success) {
          logger.error('Failed to start batch processing', { batchId, layerId });
          setShowProgress(false);
        }
      } else {
        // No height transformation needed
        onOpenChange(false);
      }
    } catch (error) {
      logger.error('Error applying height configuration', error);
      setShowProgress(false);
    }
  };
  
  // Handle progress complete
  const handleProgressComplete = () => {
    setShowProgress(false);
    setBatchId(null);
    onOpenChange(false);
  };
  
  // Handle progress cancel
  const handleProgressCancel = () => {
    setShowProgress(false);
    // The batch has already been cancelled in the progress component
    setBatchId(null);
  };
  
  // Content rendered when progress is showing
  const renderProgressContent = () => {
    if (!batchId) return null;
    
    return (
      <div className="flex justify-center items-center p-4">
        <HeightTransformProgress
          batchId={batchId}
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
        
        {/* Advanced mode configuration */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="base">
              Base Elevation
            </TabsTrigger>
            <TabsTrigger value="height">
              Height/Top
            </TabsTrigger>
            <TabsTrigger value="visual">
              Visualization
            </TabsTrigger>
          </TabsList>
          
          {/* Base Elevation Tab */}
          <TabsContent value="base" className="space-y-4">
            <div className="text-sm mb-3">
              Configure where features start in 3D space
            </div>
            
            <div className="space-y-3">
              <Label>Base Elevation Source</Label>
              <RadioGroup
                value={advancedConfig.baseElevation.source}
                onValueChange={(value) => {
                  setAdvancedConfig({
                    ...advancedConfig,
                    baseElevation: {
                      ...advancedConfig.baseElevation,
                      source: value as 'z_coord' | 'attribute' | 'terrain'
                    }
                  });
                }}
                className="flex flex-col space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="terrain" id="base-terrain" />
                  <Label htmlFor="base-terrain" className="font-normal">
                    Terrain Surface
                    <p className="text-xs text-muted-foreground">
                      Features will be placed on the terrain surface
                    </p>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem 
                    value="z_coord" 
                    id="base-z" 
                    disabled={!zCoordinatesInfo.hasZ}
                  />
                  <Label htmlFor="base-z" className={`font-normal ${!zCoordinatesInfo.hasZ ? 'text-muted-foreground' : ''}`}>
                    Z Coordinates
                    <p className="text-xs text-muted-foreground">
                      Use Z values from geometry as base elevation
                      {!zCoordinatesInfo.hasZ && (
                        <span className="block text-amber-600 mt-1">
                          No Z coordinates detected in this layer
                        </span>
                      )}
                    </p>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem 
                    value="attribute" 
                    id="base-attribute" 
                    disabled={numericAttributesInfo.attributes.length === 0}
                  />
                  <Label 
                    htmlFor="base-attribute" 
                    className={`font-normal ${numericAttributesInfo.attributes.length === 0 ? 'text-muted-foreground' : ''}`}
                  >
                    Attribute Value
                    <p className="text-xs text-muted-foreground">
                      Use a numeric attribute for base elevation
                      {numericAttributesInfo.attributes.length === 0 && (
                        <span className="block text-amber-600 mt-1">
                          No numeric attributes detected in this layer
                        </span>
                      )}
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {advancedConfig.baseElevation.source === 'attribute' && (
              <div className="space-y-2 mt-3">
                <Label htmlFor="base-attribute-select">Base Elevation Attribute</Label>
                <Select 
                  value={advancedConfig.baseElevation.attributeName || ''}
                  onValueChange={(value) => {
                    setAdvancedConfig({
                      ...advancedConfig,
                      baseElevation: {
                        ...advancedConfig.baseElevation,
                        attributeName: value
                      }
                    });
                  }}
                >
                  <SelectTrigger id="base-attribute-select">
                    <SelectValue placeholder="Select attribute" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericAttributesInfo.attributes.map(attr => (
                      <SelectItem key={attr.name} value={attr.name}>
                        {attr.name} ({attr.min.toFixed(1)} - {attr.max.toFixed(1)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox 
                    id="base-absolute" 
                    checked={advancedConfig.baseElevation.isAbsolute}
                    onCheckedChange={(checked) => {
                      setAdvancedConfig({
                        ...advancedConfig,
                        baseElevation: {
                          ...advancedConfig.baseElevation,
                          isAbsolute: !!checked
                        }
                      });
                    }}
                  />
                  <label
                    htmlFor="base-absolute"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Value is absolute elevation (not relative to terrain)
                  </label>
                </div>
              </div>
            )}
          </TabsContent>
          
          {/* Height/Top Tab */}
          <TabsContent value="height" className="space-y-4">
            <div className="text-sm mb-3">
              Configure top elevation or height of features
            </div>
            
            <div className="space-y-3">
              <Label>Height Source</Label>
              <RadioGroup
                value={advancedConfig.heightConfig.source}
                onValueChange={(value) => {
                  setAdvancedConfig({
                    ...advancedConfig,
                    heightConfig: {
                      ...advancedConfig.heightConfig,
                      source: value as 'attribute' | 'calculated' | 'none'
                    }
                  });
                }}
                className="flex flex-col space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="height-none" />
                  <Label htmlFor="height-none" className="font-normal">
                    No Height/Flat
                    <p className="text-xs text-muted-foreground">
                      Features will be flat at base elevation
                    </p>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem 
                    value="attribute" 
                    id="height-attribute" 
                    disabled={numericAttributesInfo.attributes.length === 0}
                  />
                  <Label 
                    htmlFor="height-attribute" 
                    className={`font-normal ${numericAttributesInfo.attributes.length === 0 ? 'text-muted-foreground' : ''}`}
                  >
                    Attribute Value
                    <p className="text-xs text-muted-foreground">
                      Use a numeric attribute for height or top elevation
                      {numericAttributesInfo.attributes.length === 0 && (
                        <span className="block text-amber-600 mt-1">
                          No numeric attributes detected in this layer
                        </span>
                      )}
                    </p>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="calculated" id="height-calculated" disabled />
                  <Label htmlFor="height-calculated" className="font-normal text-muted-foreground">
                    Calculated Value
                    <p className="text-xs text-muted-foreground">
                      Calculate height from other attributes or properties
                      <span className="block text-amber-600 mt-1">
                        Coming soon
                      </span>
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {advancedConfig.heightConfig.source === 'attribute' && (
              <div className="space-y-2 mt-3">
                <Label htmlFor="height-attribute-select">Height Attribute</Label>
                <Select 
                  value={advancedConfig.heightConfig.attributeName || ''}
                  onValueChange={(value) => {
                    setAdvancedConfig({
                      ...advancedConfig,
                      heightConfig: {
                        ...advancedConfig.heightConfig,
                        attributeName: value
                      }
                    });
                  }}
                >
                  <SelectTrigger id="height-attribute-select">
                    <SelectValue placeholder="Select attribute" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericAttributesInfo.attributes.map(attr => (
                      <SelectItem key={attr.name} value={attr.name}>
                        {attr.name} ({attr.min.toFixed(1)} - {attr.max.toFixed(1)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox 
                    id="height-relative" 
                    checked={advancedConfig.heightConfig.isRelative}
                    onCheckedChange={(checked) => {
                      setAdvancedConfig({
                        ...advancedConfig,
                        heightConfig: {
                          ...advancedConfig.heightConfig,
                          isRelative: !!checked
                        }
                      });
                    }}
                  />
                  <label
                    htmlFor="height-relative"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Value is relative height (not absolute top elevation)
                  </label>
                </div>
              </div>
            )}
          </TabsContent>
          
          {/* Visualization Tab */}
          <TabsContent value="visual" className="space-y-4">
            <div className="text-sm mb-3">
              Configure how heights are visualized in 3D
            </div>
            
            <div className="space-y-3">
              <Label>Visualization Type</Label>
              <RadioGroup
                value={advancedConfig.visualization.type}
                onValueChange={(value) => {
                  setAdvancedConfig({
                    ...advancedConfig,
                    visualization: {
                      ...advancedConfig.visualization,
                      type: value as 'extrusion' | 'point_elevation' | 'line_elevation'
                    }
                  });
                }}
                className="flex flex-col space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="extrusion" id="visual-extrusion" />
                  <Label htmlFor="visual-extrusion" className="font-normal">
                    Polygon Extrusion
                    <p className="text-xs text-muted-foreground">
                      Extrude polygons from base to top elevation
                    </p>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="point_elevation" id="visual-point" />
                  <Label htmlFor="visual-point" className="font-normal">
                    Point Elevation
                    <p className="text-xs text-muted-foreground">
                      Position points at specified elevation
                    </p>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="line_elevation" id="visual-line" />
                  <Label htmlFor="visual-line" className="font-normal">
                    Line Elevation
                    <p className="text-xs text-muted-foreground">
                      Position lines at specified elevation
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {advancedConfig.visualization.type === 'extrusion' && (
              <div className="space-y-2 mt-3">
                <Label>Extrusion Options</Label>
                <div className="flex flex-col space-y-2 mt-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="extrusion-faces" 
                      checked={advancedConfig.visualization.extrudedFaces}
                      onCheckedChange={(checked) => {
                        setAdvancedConfig({
                          ...advancedConfig,
                          visualization: {
                            ...advancedConfig.visualization,
                            extrudedFaces: !!checked
                          }
                        });
                      }}
                    />
                    <label
                      htmlFor="extrusion-faces"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Show side faces
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="extrusion-top" 
                      checked={advancedConfig.visualization.extrudedTop}
                      onCheckedChange={(checked) => {
                        setAdvancedConfig({
                          ...advancedConfig,
                          visualization: {
                            ...advancedConfig.visualization,
                            extrudedTop: !!checked
                          }
                        });
                      }}
                    />
                    <label
                      htmlFor="extrusion-top"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Show top face
                    </label>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        {/* Swiss Height Transformation Settings */}
        {swissCoordinatesInfo.isSwiss && (
          <SwissHeightTransformationSettings
            showSwissOptions={swissCoordinatesInfo.isSwiss}
            settings={swissHeightSettings}
            onSettingsChange={handleSwissHeightSettingsChange}
          />
        )}
        
        {/* Common Options */}
        <div className="border-t mt-6 pt-6 space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="apply-all" 
              checked={applyToAllLayers} 
              onCheckedChange={handleApplyToAllLayersChange} 
            />
            <Label htmlFor="apply-all" className="font-normal">
              Apply to all compatible layers
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="save-preference" 
              checked={savePreference} 
              onCheckedChange={handleSavePreferenceChange} 
            />
            <Label htmlFor="save-preference" className="font-normal">
              Save as default for future layers
            </Label>
          </div>
        </div>
        
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={showProgress}>
            {showProgress && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogManager } from '@/core/logging/log-manager';
import { Loader2 } from 'lucide-react';
import { usePreferenceStore } from '@/store/preference/userPreferenceStore';
import { HeightTransformBatchService } from '../services/heightTransformBatchService';
import { HeightTransformProgress } from '../components/HeightTransformProgress';

// Import all components and utilities from the index file
import { 
  HeightConfigurationDialogProps, 
  HeightSource, 
  ZCoordinatesInfo, 
  NumericAttributesInfo, 
  SwissCoordinatesInfo,
  detectZCoordinates, 
  detectNumericAttributes, 
  detectSwissCoordinates,
  determineSwissTransformationMethod,
  BaseElevationTab,
  HeightConfigTab,
  VisualizationTab,
  SwissTransformationInfo,
  DialogActions
} from './height-configuration';

// Setup logging
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
 * Height Configuration Dialog
 * 
 * Allows configuring 3D height visualization settings for geo features
 */
export function HeightConfigurationDialog({
  open,
  onOpenChange,
  layerId,
  layerName,
  featureCollection,
  onHeightSourceSelect
}: HeightConfigurationDialogProps) {
  // Source type state (keeping for backward compatibility)
  const [sourceType, setSourceType] = useState<'z_coord' | 'attribute' | 'none'>('z_coord');
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  
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
  const [swissCoordinatesInfo, setSwissCoordinatesInfo] = useState<SwissCoordinatesInfo>({
    isSwiss: false,
    hasLv95Stored: false,
    hasSwissVerticalDatum: false,
    featureCount: 0,
    message: ''
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
  const [zCoordinatesInfo, setZCoordinatesInfo] = useState<ZCoordinatesInfo>({
    hasZ: false,
    zCount: 0,
    totalCoords: 0,
    zMin: 0,
    zMax: 0,
    message: ''
  });
  
  const [numericAttributesInfo, setNumericAttributesInfo] = useState<NumericAttributesInfo>({
    attributes: [],
    message: ''
  });
  
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
      
      // Prioritize Z coordinates and LV95 stored heights
      const hasZValues = zInfo.hasZ;
      const hasLv95Heights = swissInfo.hasLv95Stored;
      const isSwissCoordinates = swissInfo.isSwiss;
      
      logger.debug('Height source detection summary', { 
        hasZValues, 
        hasLv95Heights, 
        isSwissCoordinates,
        attributesCount: attributesInfo.attributes.length
      });
      
      // Better prioritization logic for Swiss coordinates
      if (hasZValues || hasLv95Heights) {
        initialSourceType = 'z_coord';
        logger.debug('Using Z coordinates as height source', { reason: hasLv95Heights ? 'LV95 stored heights' : 'Z values in geometry' });
      } else if (attributesInfo.attributes.length > 0) {
        initialSourceType = 'attribute';
        // Set the first attribute as default
        if (!selectedAttribute && attributesInfo.attributes.length > 0) {
          setSelectedAttribute(attributesInfo.attributes[0].name);
          logger.debug('Using attribute as height source', { attributeName: attributesInfo.attributes[0].name });
        }
      }
      
      setSourceType(initialSourceType);
      
      // Configure advanced settings based on detection
      setAdvancedConfig(currentConfig => {
        const updatedConfig = {...currentConfig};
        
        // Better configuration of base elevation source
        if (hasZValues) {
          // If Z coordinates available, use them for base elevation
          updatedConfig.baseElevation.source = 'z_coord';
        } else if (attributesInfo.attributes.length > 0) {
          // If numeric attributes available but no Z coordinates, use attributes
          updatedConfig.baseElevation.source = 'attribute';
          updatedConfig.baseElevation.attributeName = attributesInfo.attributes[0].name;
        } else {
          // Fall back to terrain if no height data available
          updatedConfig.baseElevation.source = 'terrain';
        }
        
        // Configure height/extrusion if we have object_height values
        const hasObjectHeightAttribute = attributesInfo.attributes.some(attr => 
          attr.name === 'object_height' || 
          attr.name === 'height' || 
          attr.name === 'extrusion'
        );
        
        if (hasObjectHeightAttribute) {
          const objectHeightAttr = attributesInfo.attributes.find(attr => 
            attr.name === 'object_height' || 
            attr.name === 'height' || 
            attr.name === 'extrusion'
          );
          
          if (objectHeightAttr) {
            updatedConfig.heightConfig.source = 'attribute';
            updatedConfig.heightConfig.attributeName = objectHeightAttr.name;
            updatedConfig.heightConfig.isRelative = true; // Height attributes are typically relative
          }
        }
        
        return updatedConfig;
      });
    }
  }, [featureCollection, selectedAttribute]);
  
  // Handle apply button click
  const handleApply = async () => {
    setShowProgress(true);
    
    try {
      // Determine the appropriate Swiss transformation method based on feature characteristics
      const transformMethod = determineSwissTransformationMethod(swissCoordinatesInfo);
      
      // Gather the configuration based on current state
      let heightSource: HeightSource = {
        mode: 'advanced',
        applyToAllLayers,
        savePreference,
        advanced: advancedConfig,
        swissHeightTransformation: swissCoordinatesInfo.isSwiss 
          ? { transformationMethod: transformMethod } 
          : undefined
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
        // Create preference with required type (not undefined)
        const preferenceSource = {
          type: heightSource.type ?? 'none', 
          attributeName: heightSource.attributeName,
          interpretationMode: heightSource.interpretationMode,
          mode: 'advanced' as const,
          advanced: advancedConfig
        };
        setHeightSourcePreference(preferenceSource);
      }
      
      // Check if features exist before attempting transformation
      const features = featureCollection?.features || [];
      if (features.length === 0) {
        logger.warn('No features to transform', { layerId });
        // Still call the callback with the configuration, but don't attempt transformation
        onHeightSourceSelect(heightSource);
        setShowProgress(false);
        if (onOpenChange) onOpenChange(false);
        return;
      }
      
      // Apply transformation if Swiss coordinates are detected and need transformation
      if (swissCoordinatesInfo.isSwiss && heightSource.type === 'z_coord') {
        // Check if there are any features with lv95_stored height mode
        const featuresWithLv95 = features.filter(f => f.properties?.height_mode === 'lv95_stored');
        
        if (featuresWithLv95.length === 0) {
          logger.warn('No features with lv95_stored height mode found despite Swiss coordinates detection', { layerId });
          // Still apply the height source configuration without transformation
          onHeightSourceSelect(heightSource);
          setShowProgress(false);
          if (onOpenChange) onOpenChange(false);
          return;
        }
        
        logger.info('Initializing Swiss height transformation', { 
          layerId, 
          featureCount: features.length,
          lv95FeatureCount: featuresWithLv95.length,
          transformMethod 
        });
        
        // Initialize a batch transformation
        if (!layerId) {
          logger.error('Layer ID is missing or null');
          setShowProgress(false);
          return;
        }

        const diagUrl = '/api/height-transformation/feature-counts?layerId=' + layerId;
        const diagResponse = await fetch(diagUrl);
        let diagData;

        if (diagResponse.ok) {
          diagData = await diagResponse.json();
          logger.info('Feature diagnostics before transformation', diagData);
          
          if (diagData.total_features === 0) {
            logger.warn('No features found in layer', { layerId });
            // Apply the height source without transformation
            onHeightSourceSelect(heightSource);
            setShowProgress(false);
            if (onOpenChange) onOpenChange(false);
            return;
          }
          
          if (diagData.lv95_stored_features === 0) {
            logger.warn('No features with LV95 stored heights found in layer', { 
              layerId, 
              totalFeatures: diagData.total_features,
              featureHeightModes: diagData.height_mode_counts 
            });
            // Apply the height source without transformation
            onHeightSourceSelect(heightSource);
            setShowProgress(false);
            if (onOpenChange) onOpenChange(false);
            return;
          }
        }

        const batchId = await batchService.initializeBatch(
          layerId,
          'z_coord'
        );
        
        if (batchId === null) {
          logger.error('Failed to initialize height transformation batch', { layerId });
          setShowProgress(false);
        }
        
        if (batchId === 'NO_FEATURES') {
          logger.warn('No features found in layer for height transformation', { layerId });
          // Still apply the height source configuration without transformation
          onHeightSourceSelect(heightSource);
          setShowProgress(false);
          if (onOpenChange) onOpenChange(false);
          return;
        }
        
        setBatchId(batchId);
        
        // Start batch processing
        const success = await batchService.startBatchProcessing(
          batchId,
          featureCollection,
          {
            swissTransformation: {
              method: (transformMethod === 'auto' ? 'api' : transformMethod) as 'api' | 'delta',
              cache: true
            }
          }
        );
        
        if (!success) {
          logger.error('Failed to start batch processing', { batchId, layerId });
          setShowProgress(false);
        }
      } else {
        // No transformation needed, just apply configuration
        onHeightSourceSelect(heightSource);
        setShowProgress(false);
        if (onOpenChange) onOpenChange(false);
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
          <TabsContent value="base">
            <BaseElevationTab
              advancedConfig={advancedConfig}
              setAdvancedConfig={setAdvancedConfig}
              zCoordinatesInfo={zCoordinatesInfo}
              numericAttributesInfo={numericAttributesInfo}
            />
          </TabsContent>
          
          {/* Height/Top Tab */}
          <TabsContent value="height">
            <HeightConfigTab 
              advancedConfig={advancedConfig}
              setAdvancedConfig={setAdvancedConfig}
              numericAttributesInfo={numericAttributesInfo}
            />
          </TabsContent>
          
          {/* Visualization Tab */}
          <TabsContent value="visual">
            <VisualizationTab
              advancedConfig={advancedConfig}
              setAdvancedConfig={setAdvancedConfig}
            />
          </TabsContent>
        </Tabs>
        
        {/* Swiss Height Transformation Information */}
        {swissCoordinatesInfo.isSwiss && (
          <SwissTransformationInfo
            swissCoordinatesInfo={swissCoordinatesInfo}
          />
        )}
        
        {/* Dialog Actions */}
        <DialogActions
          applyToAllLayers={applyToAllLayers}
          setApplyToAllLayers={setApplyToAllLayers}
          savePreference={savePreference}
          setSavePreference={setSavePreference}
          onCancel={() => onOpenChange(false)}
          onApply={handleApply}
          showProgress={showProgress}
        />
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
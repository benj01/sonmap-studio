'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dbLogger } from '@/utils/logging/dbLogger';
import { usePreferenceStore, HeightSourcePreference } from '@/store/preference/userPreferenceStore';
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

// Setup logging context
const SOURCE = 'HeightConfigurationDialog';

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
  const { setHeightSourcePreference } = usePreferenceStore();
  
  // Batch service instance
  const batchService = HeightTransformBatchService.getInstance();
  
  useEffect(() => {
    // Analyze features when they change
    const analyzeFeatures = async () => {
      const features = featureCollection?.features || [];
      if (features.length > 0) {
        try {
          // First detect Swiss coordinates
          const swissInfo = detectSwissCoordinates(features);
          setSwissCoordinatesInfo(swissInfo);
          await dbLogger.debug('Swiss coordinates detection results', { source: SOURCE, swissInfo });
          
          // Calculate Z-coordinate info
          const zInfo = detectZCoordinates(features);
          setZCoordinatesInfo(zInfo);
          await dbLogger.debug('Z-coordinate detection results', { source: SOURCE, zInfo });
          
          // Calculate numeric attributes info
          const attributesInfo = detectNumericAttributes(features);
          setNumericAttributesInfo(attributesInfo);
          await dbLogger.debug('Numeric attributes detection results', { source: SOURCE, attributesInfo });
          
          // Prioritize Z coordinates and LV95 stored heights
          const hasZValues = zInfo.hasZ;
          const hasLv95Heights = swissInfo.hasLv95Stored;
          const isSwissCoordinates = swissInfo.isSwiss;
          
          await dbLogger.debug('Height source detection summary', { 
            source: SOURCE,
            hasZValues, 
            hasLv95Heights, 
            isSwissCoordinates,
            attributesCount: attributesInfo.attributes.length
          });
          
          // Better prioritization logic for Swiss coordinates
          if (hasZValues || hasLv95Heights) {
            await dbLogger.debug('Using Z coordinates as height source', { 
              source: SOURCE, 
              reason: hasLv95Heights ? 'LV95 stored heights' : 'Z values in geometry' 
            });
          } else if (attributesInfo.attributes.length > 0 && !selectedAttribute) {
            setSelectedAttribute(attributesInfo.attributes[0].name);
            await dbLogger.debug('Using attribute as height source', { 
              source: SOURCE, 
              attributeName: attributesInfo.attributes[0].name 
            });
          }
          
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
        } catch (error) {
          await dbLogger.error('Error analyzing features', { source: SOURCE, error });
        }
      }
    };

    // Create an async IIFE to properly handle the promise
    (async () => {
      try {
        await analyzeFeatures();
      } catch (error) {
        await dbLogger.error('Error in analyzeFeatures effect', { source: SOURCE, error });
      }
    })();

    // Optional: Return a cleanup function if needed
    return () => {
      // Any cleanup code here
    };
  }, [featureCollection, selectedAttribute]);
  
  // Handle apply button click
  const handleApply = async () => {
    setShowProgress(true);
    
    try {
      // Determine the appropriate Swiss transformation method based on feature characteristics
      const transformMethod = determineSwissTransformationMethod(swissCoordinatesInfo);
      
      // Gather the configuration based on current state
      const heightSource: HeightSource = {
        mode: 'advanced',
        type: advancedConfig.baseElevation.source === 'z_coord' ? 'z_coord' : 
              advancedConfig.heightConfig.source === 'attribute' ? 'attribute' : 'none',
        attributeName: advancedConfig.heightConfig.attributeName,
        interpretationMode: advancedConfig.heightConfig.isRelative ? 'relative' : 'absolute',
        applyToAllLayers,
        savePreference,
        advanced: advancedConfig,
        swissHeightTransformation: swissCoordinatesInfo.isSwiss 
          ? { transformationMethod: transformMethod } 
          : undefined
      };
      
      // Save as preference if requested
      if (savePreference) {
        const preferenceSource: HeightSourcePreference = {
          mode: 'advanced',
          type: advancedConfig.baseElevation.source === 'z_coord' ? 'z_coord' : 
                advancedConfig.heightConfig.source === 'attribute' ? 'attribute' : 'none',
          attributeName: advancedConfig.heightConfig.attributeName,
          interpretationMode: advancedConfig.heightConfig.isRelative ? 'relative' : 'absolute',
          advanced: advancedConfig
        };
        await setHeightSourcePreference(preferenceSource);
        await dbLogger.info('Saved height source preference', { source: SOURCE, heightSource: preferenceSource });
      }
      
      // Start the batch transformation process
      const batchId = await batchService.initializeBatch(
        layerId,
        heightSource.type || 'none',
        heightSource.attributeName,
        featureCollection
      );

      if (batchId && batchId !== 'NO_FEATURES') {
        setBatchId(batchId);
        
        await dbLogger.info('Started height transformation batch', { 
          source: SOURCE, 
          batchId, 
          layerId, 
          heightSource 
        });

        // Start batch processing
        await batchService.startBatchProcessing(batchId, featureCollection, {
          swissTransformation: {
            method: transformMethod === 'auto' ? 'api' : transformMethod,
            cache: true
          }
        });
      } else {
        // No batch needed or no features
        if (onHeightSourceSelect) {
          onHeightSourceSelect(heightSource);
        }
        setShowProgress(false);
      }
      
    } catch (error) {
      await dbLogger.error('Error applying height configuration', { source: SOURCE, error });
      setShowProgress(false);
    }
  };
  
  const handleProgressComplete = async () => {
    try {
      await dbLogger.info('Height transformation complete', { source: SOURCE, batchId });
      setShowProgress(false);
      setBatchId(null);
      if (onHeightSourceSelect) {
        const heightSource: HeightSource = {
          mode: 'advanced',
          type: advancedConfig.baseElevation.source === 'z_coord' ? 'z_coord' : 
                advancedConfig.heightConfig.source === 'attribute' ? 'attribute' : 'none',
          attributeName: advancedConfig.heightConfig.attributeName,
          interpretationMode: advancedConfig.heightConfig.isRelative ? 'relative' : 'absolute',
          applyToAllLayers,
          savePreference,
          advanced: advancedConfig
        };
        onHeightSourceSelect(heightSource);
      }
    } catch (error) {
      await dbLogger.error('Error handling progress completion', { source: SOURCE, error });
    }
  };
  
  const handleProgressCancel = async () => {
    try {
      if (batchId) {
        const cancelled = batchService.cancelBatch(batchId);
        if (cancelled) {
          await dbLogger.warn('Height transformation cancelled', { source: SOURCE, batchId });
        }
      }
      setShowProgress(false);
      setBatchId(null);
    } catch (error) {
      await dbLogger.error('Error cancelling height transformation', { source: SOURCE, error });
    }
  };
  
  const renderProgressContent = () => {
    if (!batchId) return null;
    
    return (
      <HeightTransformProgress
        batchId={batchId}
        layerName={layerName}
        onComplete={handleProgressComplete}
        onCancel={handleProgressCancel}
      />
    );
  };
  
  const renderConfigContent = () => {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Configure Height Visualization</DialogTitle>
          <DialogDescription>
            Configure how heights should be visualized for {layerName}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="base">Base Elevation</TabsTrigger>
            <TabsTrigger value="height">Height/Extrusion</TabsTrigger>
            <TabsTrigger value="visual">Visualization</TabsTrigger>
          </TabsList>
          
          <TabsContent value="base">
            <BaseElevationTab
              advancedConfig={advancedConfig}
              setAdvancedConfig={setAdvancedConfig}
              zCoordinatesInfo={zCoordinatesInfo}
              numericAttributesInfo={numericAttributesInfo}
            />
            {swissCoordinatesInfo.isSwiss && (
              <SwissTransformationInfo swissCoordinatesInfo={swissCoordinatesInfo} />
            )}
          </TabsContent>
          
          <TabsContent value="height">
            <HeightConfigTab
              advancedConfig={advancedConfig}
              setAdvancedConfig={setAdvancedConfig}
              numericAttributesInfo={numericAttributesInfo}
            />
          </TabsContent>
          
          <TabsContent value="visual">
            <VisualizationTab
              advancedConfig={advancedConfig}
              setAdvancedConfig={setAdvancedConfig}
            />
          </TabsContent>
        </Tabs>
        
        <DialogActions
          applyToAllLayers={applyToAllLayers}
          setApplyToAllLayers={setApplyToAllLayers}
          savePreference={savePreference}
          setSavePreference={setSavePreference}
          onApply={handleApply}
          onCancel={() => onOpenChange(false)}
          showProgress={showProgress}
        />
      </>
    );
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {showProgress ? renderProgressContent() : renderConfigContent()}
      </DialogContent>
    </Dialog>
  );
} 
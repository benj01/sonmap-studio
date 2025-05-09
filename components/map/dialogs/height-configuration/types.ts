import { FeatureCollection } from 'geojson';

/**
 * Configuration for height source settings
 */
export interface HeightSource {
  // Primary mode
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
    transformationMethod: 'api' | 'delta' | 'auto';
  };
  
  // Common options
  applyToAllLayers: boolean;
  savePreference: boolean;
  selectedLayerIds?: string[];
}

/**
 * Z-coordinate detection result
 */
export interface ZCoordinatesInfo {
  hasZ: boolean;
  zCount: number;
  totalCoords: number;
  zMin: number;
  zMax: number;
  message: string;
}

/**
 * Numeric attribute info
 */
export interface NumericAttributeInfo {
  name: string;
  min: number;
  max: number;
  count: number;
}

/**
 * Results of detecting numeric attributes
 */
export interface NumericAttributesInfo {
  attributes: NumericAttributeInfo[];
  message: string;
}

/**
 * Swiss coordinates detection result
 */
export interface SwissCoordinatesInfo {
  isSwiss: boolean;
  hasLv95Stored: boolean;
  hasSwissVerticalDatum: boolean;
  message: string;
  featureCount: number;
}

/**
 * Height preview item
 */
export interface HeightPreviewItem {
  featureId: string | number;
  value: number | null;
}

/**
 * Props for the Base Elevation Tab component
 */
export interface BaseElevationTabProps {
  advancedConfig: NonNullable<HeightSource['advanced']>;
  setAdvancedConfig: React.Dispatch<React.SetStateAction<NonNullable<HeightSource['advanced']>>>;
  zCoordinatesInfo: ZCoordinatesInfo;
  numericAttributesInfo: NumericAttributesInfo;
}

/**
 * Props for the Height Configuration Tab component
 */
export interface HeightConfigTabProps {
  advancedConfig: NonNullable<HeightSource['advanced']>;
  setAdvancedConfig: React.Dispatch<React.SetStateAction<NonNullable<HeightSource['advanced']>>>;
  numericAttributesInfo: NumericAttributesInfo;
}

/**
 * Props for the Visualization Tab component
 */
export interface VisualizationTabProps {
  advancedConfig: NonNullable<HeightSource['advanced']>;
  setAdvancedConfig: React.Dispatch<React.SetStateAction<NonNullable<HeightSource['advanced']>>>;
}

/**
 * Props for the Swiss Transformation Information component
 */
export interface SwissTransformationInfoProps {
  swissCoordinatesInfo: SwissCoordinatesInfo;
}

/**
 * Props for the Dialog Actions component
 */
export interface DialogActionsProps {
  applyToAllLayers: boolean;
  setApplyToAllLayers: (checked: boolean) => void;
  savePreference: boolean;
  setSavePreference: (checked: boolean) => void;
  onCancel: () => void;
  onApply: () => void;
  showProgress: boolean;
}

/**
 * Props for the main Height Configuration Dialog component
 */
export interface HeightConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layerId: string;
  layerName: string;
  featureCollection: FeatureCollection;
  onHeightSourceSelect: (source: HeightSource) => void;
} 
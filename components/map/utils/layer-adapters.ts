import { SharedLayer } from '../context/SharedLayerContext';
import { CesiumLayer } from '../hooks/useCesiumLayers';
import { LogManager } from '@/core/logging/log-manager';
import * as Cesium from 'cesium';
import { geoJsonToCesium } from './data-converters';

const SOURCE = 'LayerAdapters';
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

export interface LayerAdapter {
  to2D: (layer: SharedLayer) => any;
  to3D: (layer: SharedLayer) => Promise<CesiumLayer>;
  from2D: (layer: any) => SharedLayer;
  from3D: (layer: CesiumLayer) => SharedLayer;
}

export interface SharedLayer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  metadata: {
    sourceType?: '2d' | '3d';
    geojson?: any;
    source2D?: any;
    source3D?: any;
    style?: {
      paint?: Record<string, any>;
      layout?: Record<string, any>;
    };
  };
  selected: boolean;
}

// Adapter for vector/GeoJSON layers
export const vectorAdapter: LayerAdapter = {
  to2D: (layer: SharedLayer) => {
    logger.debug('Converting vector layer to 2D', { layerId: layer.id });
    return {
      id: layer.id,
      type: 'geojson',
      source: {
        type: 'geojson',
        data: layer.metadata.geojson
      },
      paint: layer.metadata.style?.paint || {},
      layout: layer.metadata.style?.layout || {}
    };
  },

  to3D: async (layer: SharedLayer) => {
    logger.debug('Converting vector layer to 3D', { 
      layerId: layer.id,
      hasGeojson: !!layer.metadata.geojson
    });

    if (!layer.metadata.geojson) {
      throw new Error('No GeoJSON data available for conversion');
    }

    try {
      // Convert GeoJSON to Cesium DataSource
      const dataSource = await geoJsonToCesium(layer.metadata.geojson, {
        strokeColor: layer.metadata.style?.paint?.['line-color'] || '#1E88E5',
        strokeWidth: layer.metadata.style?.paint?.['line-width'] || 3,
        fillColor: layer.metadata.style?.paint?.['fill-color'] || '#1E88E5',
        fillOpacity: layer.metadata.style?.paint?.['fill-opacity'] || 0.5,
        clampToGround: true
      });

      return {
        id: layer.id,
        name: layer.name,
        type: 'vector',
        visible: layer.visible,
        source: dataSource,
        dataSource: dataSource
      };
    } catch (error) {
      logger.error('Error converting vector layer to 3D', { 
        layerId: layer.id,
        error 
      });
      throw error;
    }
  },

  from2D: (layer: any) => {
    return {
      id: layer.id,
      name: layer.name || layer.id,
      type: 'vector',
      visible: true,
      metadata: {
        sourceType: '2d',
        geojson: layer.source.data,
        style: {
          paint: layer.paint,
          layout: layer.layout
        }
      },
      selected: false
    };
  },

  from3D: (layer: CesiumLayer) => {
    return {
      id: layer.id,
      name: layer.name,
      type: 'vector',
      visible: layer.visible,
      metadata: {
        sourceType: '3d',
        source3D: layer.dataSource,
        style: layer.options?.style
      },
      selected: false
    };
  }
};

// Adapter for 3D Tiles layers
export const tilesetAdapter: LayerAdapter = {
  to2D: (layer: SharedLayer) => {
    logger.warn('3D Tiles cannot be converted to 2D', { layerId: layer.id });
    throw new Error('3D Tiles cannot be converted to 2D');
  },

  to3D: async (layer: SharedLayer) => {
    if (!layer.metadata.source3D) {
      logger.warn('No 3D source data available for conversion', { layerId: layer.id });
      throw new Error('No 3D source data available for conversion');
    }
    return {
      id: layer.id,
      name: layer.name,
      type: '3d-tiles',
      visible: layer.visible,
      source: layer.metadata.source3D,
      tileset: layer.metadata.source3D
    };
  },

  from2D: (layer: any) => {
    logger.warn('Cannot create 3D Tiles layer from 2D data', { layerId: layer.id });
    throw new Error('Cannot create 3D Tiles layer from 2D data');
  },

  from3D: (layer: CesiumLayer) => {
    return {
      id: layer.id,
      name: layer.name,
      type: '3d-tiles',
      visible: layer.visible,
      metadata: {
        sourceType: '3d',
        source3D: layer.tileset,
        style: layer.options?.style
      },
      selected: false
    };
  }
};

// Adapter for imagery layers
export const imageryAdapter: LayerAdapter = {
  to2D: (layer: SharedLayer) => {
    if (!layer.metadata.source2D) {
      logger.warn('No 2D source data available for conversion', { layerId: layer.id });
      throw new Error('No 2D source data available for conversion');
    }
    return layer.metadata.source2D;
  },

  to3D: async (layer: SharedLayer) => {
    if (!layer.metadata.source3D) {
      logger.warn('No 3D source data available for conversion', { layerId: layer.id });
      throw new Error('No 3D source data available for conversion');
    }
    return {
      id: layer.id,
      name: layer.name,
      type: 'imagery',
      visible: layer.visible,
      source: layer.metadata.source3D,
      imageryProvider: layer.metadata.source3D
    };
  },

  from2D: (layer: any) => {
    return {
      id: layer.id,
      name: layer.name || layer.id,
      type: 'imagery',
      visible: true,
      metadata: {
        sourceType: '2d',
        source2D: layer,
        style: layer.style
      },
      selected: false
    };
  },

  from3D: (layer: CesiumLayer) => {
    return {
      id: layer.id,
      name: layer.name,
      type: 'imagery',
      visible: layer.visible,
      metadata: {
        sourceType: '3d',
        source3D: layer.imageryProvider,
        style: layer.options?.style
      },
      selected: false
    };
  }
};

// Map of layer types to their adapters
export const layerAdapters: Record<string, LayerAdapter> = {
  geojson: vectorAdapter,
  vector: vectorAdapter,
  '3d-tiles': tilesetAdapter,
  imagery: imageryAdapter
};

// Helper function to get the appropriate adapter for a layer type
export function getLayerAdapter(type: string): LayerAdapter {
  const adapter = layerAdapters[type];
  if (!adapter) {
    logger.warn('No adapter found for layer type', { type });
    return vectorAdapter; // Default to vector adapter
  }
  return adapter;
} 
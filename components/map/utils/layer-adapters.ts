import { SharedLayer } from '../context/SharedLayerContext';
import { CesiumLayer } from '../hooks/useCesiumLayers';
import { LogManager } from '@/core/logging/log-manager';

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
  to3D: (layer: SharedLayer) => CesiumLayer;
  from2D: (layer: any) => SharedLayer;
  from3D: (layer: CesiumLayer) => SharedLayer;
}

// Adapter for GeoJSON layers
export const geojsonAdapter: LayerAdapter = {
  to2D: (layer: SharedLayer) => {
    if (!layer.metadata.source2D) {
      logger.warn('No 2D source data available for conversion', { layerId: layer.id });
      throw new Error('No 2D source data available for conversion');
    }
    return layer.metadata.source2D;
  },

  to3D: (layer: SharedLayer) => {
    if (!layer.metadata.source3D) {
      logger.warn('No 3D source data available for conversion', { layerId: layer.id });
      throw new Error('No 3D source data available for conversion');
    }
    return {
      id: layer.id,
      name: layer.name,
      type: 'vector',
      visible: layer.visible,
      source: layer.metadata.source3D,
      dataSource: layer.metadata.source3D
    };
  },

  from2D: (layer: any) => {
    return {
      id: layer.id,
      name: layer.name || layer.id,
      type: 'geojson',
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
      type: 'geojson',
      visible: layer.visible,
      metadata: {
        sourceType: '3d',
        source3D: layer.source,
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

  to3D: (layer: SharedLayer) => {
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

  to3D: (layer: SharedLayer) => {
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
  geojson: geojsonAdapter,
  '3d-tiles': tilesetAdapter,
  imagery: imageryAdapter
};

// Helper function to get the appropriate adapter for a layer type
export function getLayerAdapter(type: string): LayerAdapter {
  const adapter = layerAdapters[type];
  if (!adapter) {
    logger.warn('No adapter found for layer type', { type });
    return geojsonAdapter; // Default to GeoJSON adapter
  }
  return adapter;
} 
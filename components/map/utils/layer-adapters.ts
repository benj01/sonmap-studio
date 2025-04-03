'use client';

import * as Cesium from 'cesium';
import { SharedLayer, VectorLayerStyle, TilesetStyle, ImageryStyle, TerrainStyle } from '../context/SharedLayerContext';
import { geoJsonToCesium } from './data-converters';
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

export interface CesiumLayer {
  id: string;
  name: string;
  type: 'vector' | '3d-tiles' | 'imagery' | 'terrain';
  visible: boolean;
  source: any;
  dataSource?: Cesium.DataSource;
  imageryProvider?: Cesium.ImageryProvider;
  tileset?: Cesium.Cesium3DTileset;
  options?: any;
}

interface LayerAdapter {
  to2D: (layer: SharedLayer) => any;
  to3D: (layer: SharedLayer) => Promise<CesiumLayer>;
}

const adapters: Record<string, LayerAdapter> = {
  vector: {
    to2D: (layer: SharedLayer) => {
      logger.debug('Converting vector layer to 2D', { layerId: layer.id });
      const style = layer.metadata.style as VectorLayerStyle;
      return {
        id: layer.id,
        type: 'geojson',
        source: {
          type: 'geojson',
          data: layer.metadata.geojson
        },
        paint: style?.paint || {},
        layout: style?.layout || {}
      };
    },
    to3D: async (layer: SharedLayer): Promise<CesiumLayer> => {
      logger.debug('Converting vector layer to 3D', { layerId: layer.id });
      
      if (!layer.metadata.geojson) {
        throw new Error('No GeoJSON data available for conversion');
      }

      try {
        const style = layer.metadata.style as VectorLayerStyle;
        const dataSource = await geoJsonToCesium(layer.metadata.geojson, {
          strokeColor: style?.paint?.['line-color'] || '#1E88E5',
          strokeWidth: style?.paint?.['line-width'] || 3,
          fillColor: style?.paint?.['fill-color'] || '#1E88E5',
          fillOpacity: style?.paint?.['fill-opacity'] || 0.5,
          clampToGround: true
        });

        return {
          id: layer.id,
          name: layer.name,
          type: 'vector',
          visible: layer.visible,
          source: dataSource,
          dataSource
        };
      } catch (error) {
        logger.error('Error converting vector layer to 3D', { layerId: layer.id, error });
        throw error;
      }
    }
  },
  '3d-tiles': {
    to2D: (layer: SharedLayer) => {
      logger.warn('3D Tiles cannot be converted to 2D', { layerId: layer.id });
      throw new Error('3D Tiles cannot be converted to 2D');
    },
    to3D: async (layer: SharedLayer): Promise<CesiumLayer> => {
      logger.debug('Converting 3D tiles layer', { layerId: layer.id });
      
      if (!layer.metadata.source3D) {
        throw new Error('No 3D source data available for conversion');
      }

      try {
        const style = layer.metadata.style as TilesetStyle;
        const tileset = await Cesium.Cesium3DTileset.fromUrl(layer.metadata.source3D as string, {
          maximumScreenSpaceError: style?.maximumScreenSpaceError || 16,
          modelMatrix: style?.modelMatrix,
          show: style?.show !== undefined ? style.show : true
        });

        // Apply custom styling if specified
        if (style?.color || style?.opacity !== undefined) {
          const color = Cesium.Color.fromCssColorString(style.color || '#FFFFFF');
          if (style.opacity !== undefined) {
            color.alpha = style.opacity;
          }

          tileset.style = new Cesium.Cesium3DTileStyle({
            color: `color('${color.toCssColorString()}', ${color.alpha})`,
            show: style.show !== undefined ? style.show.toString() : 'true'
          });
        }

        // Apply color blending if specified
        if (style?.colorBlendMode) {
          const blendMode = style.colorBlendMode.toUpperCase();
          switch (blendMode) {
            case 'HIGHLIGHT':
              tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT;
              break;
            case 'MIX':
              tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.MIX;
              break;
            case 'REPLACE':
              tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.REPLACE;
              break;
            default:
              logger.warn('Invalid color blend mode', { mode: style.colorBlendMode });
          }

          if (style.colorBlendAmount !== undefined) {
            tileset.colorBlendAmount = style.colorBlendAmount;
          }
        }

        return {
          id: layer.id,
          name: layer.name,
          type: '3d-tiles',
          visible: layer.visible,
          source: tileset,
          tileset
        };
      } catch (error) {
        logger.error('Error converting 3D tiles layer', { layerId: layer.id, error });
        throw error;
      }
    }
  },
  imagery: {
    to2D: (layer: SharedLayer) => {
      logger.debug('Converting imagery layer to 2D', { layerId: layer.id });
      const style = layer.metadata.style as ImageryStyle;
      return {
        id: layer.id,
        type: 'raster',
        source: {
          type: 'raster',
          tiles: [layer.metadata.source2D],
          tileSize: style?.tileWidth || 256
        },
        paint: {}
      };
    },
    to3D: async (layer: SharedLayer): Promise<CesiumLayer> => {
      logger.debug('Converting imagery layer to 3D', { layerId: layer.id });
      
      if (!layer.metadata.source3D) {
        throw new Error('No imagery source data available for conversion');
      }

      try {
        const style = layer.metadata.style as ImageryStyle;
        const imageryProvider = new Cesium.UrlTemplateImageryProvider({
          url: layer.metadata.source3D as string,
          minimumLevel: style?.minimumLevel,
          maximumLevel: style?.maximumLevel,
          tileWidth: style?.tileWidth || 256,
          tileHeight: style?.tileHeight || 256,
          credit: style?.credit
        });

        return {
          id: layer.id,
          name: layer.name,
          type: 'imagery',
          visible: layer.visible,
          source: imageryProvider,
          imageryProvider
        };
      } catch (error) {
        logger.error('Error converting imagery layer to 3D', { layerId: layer.id, error });
        throw error;
      }
    }
  },
  terrain: {
    to2D: (layer: SharedLayer) => {
      logger.warn('Terrain cannot be converted to 2D', { layerId: layer.id });
      throw new Error('Terrain cannot be converted to 2D');
    },
    to3D: async (layer: SharedLayer): Promise<CesiumLayer> => {
      logger.debug('Converting terrain layer', { layerId: layer.id });
      
      if (!layer.metadata.source3D) {
        throw new Error('No terrain source data available for conversion');
      }

      try {
        const style = layer.metadata.style as TerrainStyle;
        const terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(
          layer.metadata.source3D as string,
          {
            requestVertexNormals: style?.requestVertexNormals || true,
            requestWaterMask: style?.requestWaterMask || false,
            requestMetadata: style?.requestMetadata || true
          }
        );

        return {
          id: layer.id,
          name: layer.name,
          type: 'terrain',
          visible: layer.visible,
          source: terrainProvider
        };
      } catch (error) {
        logger.error('Error converting terrain layer', { layerId: layer.id, error });
        throw error;
      }
    }
  }
};

export function getLayerAdapter(type: string): LayerAdapter | undefined {
  const adapter = adapters[type];
  if (!adapter) {
    logger.warn('No adapter found for layer type', { type });
  }
  return adapter;
} 
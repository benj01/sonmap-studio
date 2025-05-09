'use client';

import * as Cesium from 'cesium';
import { SharedLayer, VectorLayerStyle, TilesetStyle, ImageryStyle, TerrainStyle } from '../context/SharedLayerContext';
import { geoJsonToCesium } from './data-converters';
import { dbLogger } from '@/utils/logging/dbLogger';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

const LOG_SOURCE = 'LayerAdapters';

export interface CesiumLayer {
  id: string;
  name: string;
  type: 'vector' | '3d-tiles' | 'imagery' | 'terrain';
  visible: boolean;
  source: Cesium.DataSource | Cesium.ImageryProvider | Cesium.Cesium3DTileset | Cesium.TerrainProvider;
  dataSource?: Cesium.DataSource;
  imageryProvider?: Cesium.ImageryProvider;
  tileset?: Cesium.Cesium3DTileset;
  options?: Record<string, unknown>;
}

interface LayerAdapter {
  to2D: (layer: SharedLayer) => Promise<Record<string, unknown>>;
  to3D: (layer: SharedLayer) => Promise<CesiumLayer>;
}

const adapters: Record<string, LayerAdapter> = {
  vector: {
    to2D: async (layer: SharedLayer): Promise<Record<string, unknown>> => {
      const context = {
        source: LOG_SOURCE,
        layerId: layer.id
      };

      await dbLogger.debug('Converting vector layer to 2D', context);
      const style = layer.metadata.style as VectorLayerStyle;
      const geojsonData = layer.metadata.geojson;
      
      if (!isValidGeoJSON(geojsonData)) {
        throw new Error('Invalid GeoJSON data');
      }

      return {
        id: layer.id,
        type: 'geojson',
        source: {
          type: 'geojson',
          data: geojsonData
        },
        paint: style?.paint || {},
        layout: style?.layout || {}
      };
    },
    to3D: async (layer: SharedLayer): Promise<CesiumLayer> => {
      const context = {
        source: LOG_SOURCE,
        layerId: layer.id
      };

      await dbLogger.debug('Converting vector layer to 3D', context);
      
      const geojsonData = layer.metadata.geojson;
      if (!isValidGeoJSON(geojsonData)) {
        throw new Error('Invalid GeoJSON data');
      }

      try {
        const style = layer.metadata.style as VectorLayerStyle;
        const dataSource = await geoJsonToCesium(geojsonData, {
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
        await dbLogger.error('Error converting vector layer to 3D', {
          ...context,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        });
        throw error;
      }
    }
  },
  '3d-tiles': {
    to2D: async (layer: SharedLayer): Promise<Record<string, unknown>> => {
      const context = {
        source: LOG_SOURCE,
        layerId: layer.id
      };

      await dbLogger.warn('3D Tiles cannot be converted to 2D', context);
      throw new Error('3D Tiles cannot be converted to 2D');
    },
    to3D: async (layer: SharedLayer): Promise<CesiumLayer> => {
      const context = {
        source: LOG_SOURCE,
        layerId: layer.id
      };

      await dbLogger.debug('Converting 3D tiles layer', context);
      
      const source3D = layer.metadata.source3D;
      if (!source3D || typeof source3D !== 'string') {
        throw new Error('No valid 3D source URL available for conversion');
      }

      try {
        const style = layer.metadata.style as TilesetStyle;
        const tileset = await Cesium.Cesium3DTileset.fromUrl(source3D, {
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
              await dbLogger.warn('Invalid color blend mode', {
                ...context,
                mode: style.colorBlendMode
              });
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
        await dbLogger.error('Error converting 3D tiles layer', {
          ...context,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        });
        throw error;
      }
    }
  },
  imagery: {
    to2D: async (layer: SharedLayer): Promise<Record<string, unknown>> => {
      const context = {
        source: LOG_SOURCE,
        layerId: layer.id
      };

      await dbLogger.debug('Converting imagery layer to 2D', context);
      const style = layer.metadata.style as ImageryStyle;
      
      const source2D = layer.metadata.source2D;
      if (!source2D || typeof source2D !== 'string') {
        throw new Error('No valid 2D source URL available for conversion');
      }

      return {
        id: layer.id,
        type: 'raster',
        source: {
          type: 'raster',
          tiles: [source2D],
          tileSize: style?.tileWidth || 256
        },
        paint: {}
      };
    },
    to3D: async (layer: SharedLayer): Promise<CesiumLayer> => {
      const context = {
        source: LOG_SOURCE,
        layerId: layer.id
      };

      await dbLogger.debug('Converting imagery layer to 3D', context);
      
      const source3D = layer.metadata.source3D;
      if (!source3D || typeof source3D !== 'string') {
        throw new Error('No valid imagery source URL available for conversion');
      }

      try {
        const style = layer.metadata.style as ImageryStyle;
        const imageryProvider = new Cesium.UrlTemplateImageryProvider({
          url: source3D,
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
        await dbLogger.error('Error converting imagery layer to 3D', {
          ...context,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        });
        throw error;
      }
    }
  },
  terrain: {
    to2D: async (layer: SharedLayer): Promise<Record<string, unknown>> => {
      const context = {
        source: LOG_SOURCE,
        layerId: layer.id
      };

      await dbLogger.warn('Terrain cannot be converted to 2D', context);
      throw new Error('Terrain cannot be converted to 2D');
    },
    to3D: async (layer: SharedLayer): Promise<CesiumLayer> => {
      const context = {
        source: LOG_SOURCE,
        layerId: layer.id
      };

      await dbLogger.debug('Converting terrain layer', context);
      
      const source3D = layer.metadata.source3D;
      if (!source3D || typeof source3D !== 'string') {
        throw new Error('No terrain source data available for conversion');
      }

      try {
        const style = layer.metadata.style as TerrainStyle;
        const terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(
          source3D,
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
        await dbLogger.error('Error converting terrain layer', {
          ...context,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        });
        throw error;
      }
    }
  }
};

export function getLayerAdapter(type: string): LayerAdapter | undefined {
  return adapters[type];
}

function isFeatureCollection(obj: unknown): obj is FeatureCollection<Geometry, GeoJsonProperties> {
  return typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'FeatureCollection';
}

function isFeature(obj: unknown): obj is Feature<Geometry, GeoJsonProperties> {
  return typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'Feature';
}

function isValidGeoJSON(obj: unknown): obj is FeatureCollection<Geometry, GeoJsonProperties> | Feature<Geometry, GeoJsonProperties> {
  return isFeatureCollection(obj) || isFeature(obj);
} 
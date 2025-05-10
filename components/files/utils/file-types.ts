import type { FileTypeConfig } from '../types';
import { dbLogger } from '../../../utils/logging/dbLogger';

const LOG_SOURCE = 'FileTypeUtil';

/**
 * Utility functions for handling file types and MIME types
 */

export const FILE_TYPE_CONFIGS: Record<string, FileTypeConfig> = {
  // Shapefile
  shp: {
    mainExtension: '.shp',
    description: 'ESRI Shapefile',
    mimeType: 'application/x-esri-shape',
    maxSize: 2 * 1024 * 1024 * 1024, // 2GB
    companionFiles: [
      {
        extension: '.shx',
        description: 'Shape Index File',
        required: true,
        maxSize: 256 * 1024 * 1024, // 256MB
      },
      {
        extension: '.dbf',
        description: 'Attribute Database',
        required: true,
        maxSize: 2 * 1024 * 1024 * 1024, // 2GB
      },
      {
        extension: '.prj',
        description: 'Projection Definition',
        required: false,
        maxSize: 1 * 1024 * 1024, // 1MB
      }
    ]
  },
  // GeoJSON
  geojson: {
    mainExtension: '.geojson',
    description: 'GeoJSON',
    mimeType: 'application/geo+json',
    maxSize: 512 * 1024 * 1024, // 512MB
    companionFiles: [
      {
        extension: '.qmd',
        description: 'QGIS Metadata',
        required: false,
        maxSize: 1 * 1024 * 1024, // 1MB
        mimeType: 'application/xml',
        validateContent: async (file: File) => {
          try {
            const content = await file.text();
            return content.includes('<!DOCTYPE qgis') || content.includes('<qgis');
          } catch (error) {
            await dbLogger.error('QMD validation error', { error }, { LOG_SOURCE });
            return false;
          }
        }
      }
    ],
    validateContent: async (file: File) => {
      try {
        const content = await file.text();
        let json;
        try {
          json = JSON.parse(content);
        } catch (e) {
          await dbLogger.warn('Failed to parse GeoJSON', { error: e }, { LOG_SOURCE });
          return false;
        }

        const isValidType = json.type === 'FeatureCollection' || 
                          json.type === 'Feature' || 
                          ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(json.type);

        if (!isValidType) {
          await dbLogger.warn('Invalid GeoJSON type', { type: json.type }, { LOG_SOURCE });
          return false;
        }

        if (json.type === 'FeatureCollection' && !Array.isArray(json.features)) {
          await dbLogger.warn('FeatureCollection missing features array', { LOG_SOURCE });
          return false;
        }

        if (json.type === 'Feature' && !json.geometry) {
          await dbLogger.warn('Feature missing geometry', { LOG_SOURCE });
          return false;
        }

        return true;
      } catch (error) {
        await dbLogger.error('GeoJSON validation error', { error }, { LOG_SOURCE });
        return false;
      }
    }
  },
  // AutoCAD DXF
  dxf: {
    mainExtension: '.dxf',
    description: 'AutoCAD DXF',
    mimeType: 'application/dxf',
    maxSize: 1024 * 1024 * 1024, // 1GB
    companionFiles: []
  },
  // AutoCAD DWG
  dwg: {
    mainExtension: '.dwg',
    description: 'AutoCAD DWG',
    mimeType: 'application/acad',
    maxSize: 1024 * 1024 * 1024, // 1GB
    companionFiles: []
  },
  // CSV with coordinates
  csv: {
    mainExtension: '.csv',
    description: 'Comma-Separated Values',
    mimeType: 'text/csv',
    maxSize: 512 * 1024 * 1024, // 512MB
    companionFiles: [
      {
        extension: '.prj',
        description: 'Projection Definition',
        required: false,
        maxSize: 1 * 1024 * 1024, // 1MB
      }
    ],
    validateContent: async (file: File) => {
      try {
        const sample = await file.slice(0, 1024).text();
        const lines = sample.split('\n');
        if (lines.length < 2) return false;
        const header = lines[0].toLowerCase();
        return /\b(lat|latitude|lon|longitude|x|y|z|easting|northing|elevation)\b/.test(header);
      } catch (error) {
        await dbLogger.error('CSV validation error', { error }, { LOG_SOURCE });
        return false;
      }
    }
  },
  // XYZ Point Cloud
  xyz: {
    mainExtension: '.xyz',
    description: 'XYZ Point Cloud',
    mimeType: 'text/plain',
    maxSize: 2 * 1024 * 1024 * 1024, // 2GB
    companionFiles: [
      {
        extension: '.prj',
        description: 'Projection Definition',
        required: false,
        maxSize: 1 * 1024 * 1024, // 1MB
      }
    ],
    validateContent: async (file: File) => {
      try {
        const sample = await file.slice(0, 1024).text();
        const lines = sample.split('\n');
        if (lines.length < 2) return false;
        const firstLine = lines[0].trim();
        return /^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?\s+-?\d+(\.\d+)?(\s+.*)?$/.test(firstLine);
      } catch (error) {
        await dbLogger.error('XYZ validation error', { error }, { LOG_SOURCE });
        return false;
      }
    }
  },
  // KML
  kml: {
    mainExtension: '.kml',
    description: 'Google Earth KML',
    mimeType: 'application/vnd.google-earth.kml+xml',
    maxSize: 256 * 1024 * 1024, // 256MB
    companionFiles: []
  }
};

export { FileTypeConfig };

export function getMimeType(fileName: string): string {
  const extension = getExtension(fileName);
  const config = getConfigForExtension(extension);
  return config?.mimeType || 'application/octet-stream';
}

export function isShapefile(fileName: string): boolean {
  const extension = getExtension(fileName);
  return extension.toLowerCase() === '.shp';
}

export function getRequiredCompanions(fileName: string): string[] {
  const config = getConfigForFile(fileName);
  return config?.companionFiles?.filter(c => c.required).map(c => c.extension) || [];
}

export function isMainGeoFile(fileName: string): boolean {
  const extension = getExtension(fileName).toLowerCase();
  return [
    '.shp', '.geojson', '.dxf', '.dwg', '.csv', '.xyz', '.kml'
  ].includes(extension);
}

export function getConfigForFile(fileName: string): FileTypeConfig | undefined {
  const extension = getExtension(fileName);
  return getConfigForExtension(extension);
}

function getConfigForExtension(extension: string): FileTypeConfig | undefined {
  return FILE_TYPE_CONFIGS[extension.replace('.', '').toLowerCase()];
}

export function getExtension(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName);
  return match ? match[0] : '';
}

export function getAllConfigs(): FileTypeConfig[] {
  return Object.values(FILE_TYPE_CONFIGS);
} 
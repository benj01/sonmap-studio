import { z } from 'zod';

/**
 * Companion file configuration
 */
export interface CompanionFileConfig {
  extension: string;
  description: string;
  required: boolean;
  maxSize?: number;  // in bytes
}

/**
 * File type configuration
 */
export interface FileTypeConfig {
  mainExtension: string;
  description: string;
  mimeType: string;
  maxSize?: number;  // in bytes
  companionFiles: CompanionFileConfig[];
  validateContent?: (file: File) => Promise<boolean>;
}

/**
 * File type configurations for geodata formats
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
      },
      {
        extension: '.sbn',
        description: 'Spatial Index',
        required: false,
        maxSize: 256 * 1024 * 1024, // 256MB
      },
      {
        extension: '.sbx',
        description: 'Spatial Index',
        required: false,
        maxSize: 256 * 1024 * 1024, // 256MB
      }
    ]
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

  // CSV
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
      const sample = await file.slice(0, 1024).text();
      // Basic CSV validation - check if it has at least one row with coordinates
      const lines = sample.split('\n');
      if (lines.length < 2) return false;
      const header = lines[0].toLowerCase();
      // Check for common coordinate column names
      return /\b(lat|latitude|lon|longitude|x|y|z|easting|northing|elevation)\b/.test(header);
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
      const sample = await file.slice(0, 1024).text();
      const lines = sample.split('\n');
      if (lines.length < 2) return false;
      // Check if first line matches XYZ format (3+ space/tab-separated numbers)
      const firstLine = lines[0].trim();
      return /^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?\s+-?\d+(\.\d+)?(\s+.*)?$/.test(firstLine);
    }
  },

  // GeoJSON
  geojson: {
    mainExtension: '.geojson',
    description: 'GeoJSON',
    mimeType: 'application/geo+json',
    maxSize: 512 * 1024 * 1024, // 512MB
    companionFiles: [],
    validateContent: async (file: File) => {
      try {
        const sample = await file.slice(0, 1024).text();
        const json = JSON.parse(sample);
        return json.type === 'FeatureCollection' || 
               json.type === 'Feature' || 
               ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(json.type);
      } catch {
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

/**
 * Validation schema for geodata files
 */
export const GeoFileValidationSchema = z.object({
  type: z.enum(['shp', 'dxf', 'dwg', 'csv', 'xyz', 'geojson', 'kml']),
  size: z.number().max(2 * 1024 * 1024 * 1024), // 2GB max
  companionFiles: z.array(z.object({
    type: z.string(),
    size: z.number(),
    required: z.boolean()
  })).optional()
});

/**
 * Helper functions for file type handling
 */
export const getFileTypeConfig = (fileName: string): FileTypeConfig | undefined => {
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  return Object.values(FILE_TYPE_CONFIGS).find(config => 
    config.mainExtension === ext || 
    config.companionFiles.some(comp => comp.extension === ext)
  );
};

export const getMimeType = (fileName: string): string => {
  const config = getFileTypeConfig(fileName);
  return config?.mimeType || 'application/octet-stream';
};

export const validateCompanionFiles = (
  mainFile: File, 
  companions: File[]
): { valid: boolean; message?: string } => {
  const config = getFileTypeConfig(mainFile.name);
  if (!config) return { valid: true };

  // Check main file size
  if (config.maxSize && mainFile.size > config.maxSize) {
    return {
      valid: false,
      message: `Main file exceeds maximum size of ${Math.round(config.maxSize / (1024 * 1024))}MB`
    };
  }

  // Check for required companion files
  const missingRequired = config.companionFiles
    .filter(comp => comp.required)
    .filter(comp => !companions.some(f => 
      f.name.toLowerCase().endsWith(comp.extension.toLowerCase())
    ));

  if (missingRequired.length > 0) {
    return {
      valid: false,
      message: `Missing required companion files: ${missingRequired.map(f => f.extension).join(', ')}`
    };
  }

  // Check companion file sizes
  for (const companion of companions) {
    const ext = companion.name.substring(companion.name.lastIndexOf('.')).toLowerCase();
    const compConfig = config.companionFiles.find(c => c.extension === ext);
    
    if (compConfig?.maxSize && companion.size > compConfig.maxSize) {
      return {
        valid: false,
        message: `Companion file ${companion.name} exceeds maximum size of ${Math.round(compConfig.maxSize / (1024 * 1024))}MB`
      };
    }
  }

  return { valid: true };
}; 
import type { FileTypeConfig, CompanionFileConfig } from '../types';

/**
 * Utility class for handling file types and MIME types
 */
export class FileTypeUtil {
  private static readonly FILE_TYPE_CONFIGS: Record<string, FileTypeConfig> = {
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
              console.error('[FileTypeUtil] QMD validation error', error);
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
            console.warn('[FileTypeUtil] Failed to parse GeoJSON', e);
            return false;
          }

          const isValidType = json.type === 'FeatureCollection' || 
                            json.type === 'Feature' || 
                            ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(json.type);

          if (!isValidType) {
            console.warn('[FileTypeUtil] Invalid GeoJSON type', { type: json.type });
            return false;
          }

          if (json.type === 'FeatureCollection' && !Array.isArray(json.features)) {
            console.warn('[FileTypeUtil] FeatureCollection missing features array');
            return false;
          }

          if (json.type === 'Feature' && !json.geometry) {
            console.warn('[FileTypeUtil] Feature missing geometry');
            return false;
          }

          return true;
        } catch (error) {
          console.error('[FileTypeUtil] GeoJSON validation error', error);
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
          console.error('[FileTypeUtil] CSV validation error', error);
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
          console.error('[FileTypeUtil] XYZ validation error', error);
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
   * Get MIME type for a file name
   * @param fileName File name or path
   * @returns MIME type string
   */
  static getMimeType(fileName: string): string {
    const extension = this.getExtension(fileName);
    const config = this.getConfigForExtension(extension);
    return config?.mimeType || 'application/octet-stream';
  }

  /**
   * Check if a file is a shapefile
   * @param fileName File name or path
   * @returns boolean indicating if file is a shapefile
   */
  static isShapefile(fileName: string): boolean {
    const extension = this.getExtension(fileName);
    return extension.toLowerCase() === '.shp';
  }

  /**
   * Get required companion files for a given file type
   * @param fileName File name or path
   * @returns Array of required companion file extensions
   */
  static getRequiredCompanions(fileName: string): string[] {
    const extension = this.getExtension(fileName);
    const config = this.getConfigForExtension(extension);
    return config?.companionFiles
      ?.filter((companion: CompanionFileConfig) => companion.required)
      .map((companion: CompanionFileConfig) => companion.extension) || [];
  }

  /**
   * Check if a file is a main geo data file
   * @param fileName File name or path
   * @returns boolean indicating if file is a main geo data file
   */
  static isMainGeoFile(fileName: string): boolean {
    const extension = this.getExtension(fileName);
    return Object.values(this.FILE_TYPE_CONFIGS)
      .some(config => config.mainExtension.toLowerCase() === extension.toLowerCase());
  }

  /**
   * Get file type configuration for a file
   * @param fileName File name or path
   * @returns FileTypeConfig or undefined
   */
  static getConfigForFile(fileName: string): FileTypeConfig | undefined {
    const extension = this.getExtension(fileName);
    return this.getConfigForExtension(extension);
  }

  /**
   * Get file type configuration for a given extension
   * @param extension File extension (with dot)
   * @returns FileTypeConfig or undefined
   */
  private static getConfigForExtension(extension: string): FileTypeConfig | undefined {
    return Object.values(this.FILE_TYPE_CONFIGS)
      .find(config => config.mainExtension.toLowerCase() === extension.toLowerCase());
  }

  /**
   * Get extension from file name
   * @param fileName File name or path
   * @returns Extension with dot
   */
  static getExtension(fileName: string): string {
    const match = fileName.match(/\.[^.]*$/);
    return match ? match[0].toLowerCase() : '';
  }

  /**
   * Get all file type configurations
   * @returns Array of FileTypeConfig objects
   */
  static getAllConfigs(): FileTypeConfig[] {
    return Object.values(this.FILE_TYPE_CONFIGS);
  }
} 
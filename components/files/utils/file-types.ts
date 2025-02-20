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
} 
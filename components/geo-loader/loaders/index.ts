// components/geo-loader/loaders/index.ts

import { GeoFileLoader } from '../../../types/geo';
import dxfLoader from './dxf';
import csvXyzLoader from './csv-zyz';
import shapefileLoader from './shapefile';

class LoaderRegistry {
  private loaders: GeoFileLoader[] = [];

  constructor() {
    // Register all available loaders
    this.registerLoader(dxfLoader);
    this.registerLoader(csvXyzLoader);
    this.registerLoader(shapefileLoader);
  }

  registerLoader(loader: GeoFileLoader) {
    this.loaders.push(loader);
  }

  async getLoaderForFile(file: File): Promise<GeoFileLoader | null> {
    for (const loader of this.loaders) {
      if (await loader.canLoad(file)) {
        return loader;
      }
    }
    return null;
  }

  async getSupportedExtensions(): Promise<string[]> {
    // Create a dummy file for each extension to test with canLoad
    const extensions = ['.dxf', '.shp', '.csv', '.xyz', '.txt'];
    const supportedExts = [];

    for (const ext of extensions) {
      const dummyFile = new File([], `dummy${ext}`);
      for (const loader of this.loaders) {
        if (await loader.canLoad(dummyFile)) {
          supportedExts.push(ext);
          break;
        }
      }
    }

    return supportedExts;
  }

  async validateFile(file: File): Promise<{
    valid: boolean;
    loader?: GeoFileLoader;
    error?: string;
  }> {
    try {
      const loader = await this.getLoaderForFile(file);
      if (!loader) {
        return {
          valid: false,
          error: `Unsupported file type: ${file.name}`
        };
      }

      // Basic size validation (adjust limits as needed)
      if (file.size > 100 * 1024 * 1024) { // 100MB
        return {
          valid: false,
          error: 'File is too large. Maximum size is 100MB.'
        };
      }

      return {
        valid: true,
        loader
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error validating file'
      };
    }
  }

  // Helper function to get file extension
  getFileExtension(filename: string): string {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
  }

  // Get recommended loader options based on file type
  async getRecommendedOptions(file: File): Promise<any> {
    const loader = await this.getLoaderForFile(file);
    if (!loader) return {};

    const ext = this.getFileExtension(file.name);
    
    switch (ext) {
      case 'csv':
      case 'txt':
      case 'xyz':
        return {
          delimiter: ',',  // Default delimiter, will be auto-detected
          skipRows: 0,
          skipColumns: 0,
          hasHeaders: true
        };
      case 'dxf':
        return {
          selectedLayers: [], // Will be populated after analysis
          importStyles: true
        };
      case 'shp':
        return {
          importAttributes: true
        };
      default:
        return {};
    }
  }
}

// Create and export singleton instance
export const loaderRegistry = new LoaderRegistry();

// Export type for use in other components
export type { GeoFileLoader };

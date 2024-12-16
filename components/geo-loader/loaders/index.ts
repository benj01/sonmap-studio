import { GeoFileLoader } from '../../../types/geo';
import dxfLoader from './dxf';
import shapefileLoader from './shapefile';
import csvLoader from './csv-xyz';

/**
 * Registry for managing geo file loaders.
 * Each loader is responsible for handling a specific file format (DXF, SHP, CSV, etc.).
 */
class LoaderRegistry {
  private loaders: GeoFileLoader[];

  constructor() {
    // Initialize with default loaders
    this.loaders = [dxfLoader, shapefileLoader, csvLoader];
  }

  /**
   * Validates if a file can be loaded by any registered loader.
   * @param file The file to validate
   * @returns Object containing validation result and matching loader if found
   */
  async validateFile(file: File): Promise<{ valid: boolean; loader?: GeoFileLoader; error?: string }> {
    for (const loader of this.loaders) {
      if (await loader.canLoad(file)) {
        return { valid: true, loader };
      }
    }
    return { valid: false, error: 'No suitable loader found for this file type' };
  }

  /**
   * Gets the appropriate loader for a given file.
   * @param file The file to get a loader for
   * @returns The matching loader or undefined if none found
   */
  async getLoaderForFile(file: File): Promise<GeoFileLoader | undefined> {
    const { loader } = await this.validateFile(file);
    return loader;
  }

  /**
   * Gets a list of supported file extensions.
   * @returns Array of supported file extensions (e.g., ['.dxf', '.shp', '.csv'])
   */
  getSupportedExtensions(): string[] {
    return ['.dxf', '.shp', '.csv'];
  }

  /**
   * Gets recommended import options for a specific file type.
   * @param file The file to get options for
   * @returns Object containing recommended options
   */
  async getRecommendedOptions(file: File): Promise<Record<string, any>> {
    const { loader } = await this.validateFile(file);
    if (!loader) return {};

    // Get file extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'dxf':
        return {
          coordinateSystem: 'EPSG:4326', // Default to WGS84
          targetSystem: 'EPSG:4326'
        };
      case 'shp':
        return {
          importAttributes: true
        };
      default:
        return {};
    }
  }

  /**
   * Registers a new loader.
   * @param loader The loader to register
   */
  registerLoader(loader: GeoFileLoader): void {
    this.loaders.push(loader);
  }

  /**
   * Unregisters a loader.
   * @param loader The loader to unregister
   */
  unregisterLoader(loader: GeoFileLoader): void {
    const index = this.loaders.indexOf(loader);
    if (index !== -1) {
      this.loaders.splice(index, 1);
    }
  }

  /**
   * Gets all registered loaders.
   * @returns Array of registered loaders
   */
  getLoaders(): GeoFileLoader[] {
    return [...this.loaders];
  }
}

// Export a singleton instance
export const loaderRegistry = new LoaderRegistry();

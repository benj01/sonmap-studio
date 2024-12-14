import dxfLoader from './dxf';
import shapefileLoader from './shapefile';
import csvLoader from './csv-zyz';

class LoaderRegistry {
  private loaders = [dxfLoader, shapefileLoader, csvLoader];

  async validateFile(file: File) {
    for (const loader of this.loaders) {
      if (await loader.canLoad(file)) {
        return { valid: true, loader };
      }
    }
    return { valid: false, error: 'No suitable loader found for this file type' };
  }

  async getLoaderForFile(file: File) {
    const { loader } = await this.validateFile(file);
    return loader;
  }

  async getSupportedExtensions() {
    return ['.dxf', '.shp', '.csv'];
  }

  async getRecommendedOptions(file: File) {
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

  setLogCallback(callback: (message: string) => void) {
    // Set log callback for all loaders
    this.loaders.forEach(loader => {
      if ('setLogCallback' in loader) {
        (loader as any).setLogCallback(callback);
      }
    });
  }
}

export const loaderRegistry = new LoaderRegistry();

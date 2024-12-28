import { DxfLayer } from '../types';

export class DxfLayerProcessor {
  private static layerCache = new Map<string, DxfLayer>();

  /**
   * Extract layer names from raw layer data
   */
  static extractLayerNames(layerData: Record<string, any>): string[] {
    return Object.entries(layerData)
      .filter(([_, layer]) => typeof layer === 'object' && layer !== null)
      .map(([name, _]) => name);
  }

  /**
   * Convert raw layer data to our format
   */
  static convertLayers(layers: Record<string, any>): DxfLayer[] {
    const converted = Object.entries(layers).map(([name, layer]) => {
      const dxfLayer: DxfLayer = {
        name,
        color: typeof layer.color === 'number' ? layer.color : undefined,
        lineType: typeof layer.lineType === 'string' ? layer.lineType : undefined,
        lineWeight: typeof layer.lineWeight === 'number' ? layer.lineWeight : undefined,
        frozen: typeof layer.frozen === 'boolean' ? layer.frozen : false,
        locked: typeof layer.locked === 'boolean' ? layer.locked : false,
        off: typeof layer.off === 'boolean' ? layer.off : false
      };
      return dxfLayer;
    });

    console.log('[DEBUG] Converted layers:', {
      input: Object.keys(layers).length,
      output: converted.length,
      names: converted.map(l => l.name)
    });

    return converted;
  }

  /**
   * Add layer to cache
   */
  static addLayer(layer: DxfLayer): void {
    this.layerCache.set(layer.name, layer);
  }

  /**
   * Get layer from cache
   */
  static getLayer(name: string): DxfLayer | undefined {
    return this.layerCache.get(name);
  }

  /**
   * Get all cached layers
   */
  static getAllLayers(): DxfLayer[] {
    return Array.from(this.layerCache.values());
  }

  /**
   * Clear layer cache
   */
  static clearCache(): void {
    this.layerCache.clear();
  }

  /**
   * Parse layers from raw DXF content
   * This is used as a fallback when the DXF parser fails
   */
  static async parseLayers(content: string): Promise<DxfLayer[]> {
    const layers: DxfLayer[] = [];
    const layerRegex = /^\s*0\s*\nLAYER\s*\n\s*2\s*\n(.*?)\n/gm;
    let match;

    while ((match = layerRegex.exec(content)) !== null) {
      const name = match[1].trim();
      if (name && !name.startsWith('*')) { // Skip special layers
        layers.push({
          name,
          color: undefined,
          lineType: undefined,
          lineWeight: undefined,
          frozen: false,
          locked: false,
          off: false
        });
      }
    }

    console.log('[DEBUG] Parsed layers from content:', {
      count: layers.length,
      names: layers.map(l => l.name)
    });

    return layers;
  }

  /**
   * Validate layer data
   */
  static validateLayer(layer: any): layer is DxfLayer {
    if (!layer || typeof layer !== 'object') {
      console.warn('[DEBUG] Invalid layer (not an object):', layer);
      return false;
    }

    if (typeof layer.name !== 'string' || !layer.name) {
      console.warn('[DEBUG] Layer missing name:', layer);
      return false;
    }

    // Optional properties
    if (layer.color !== undefined && typeof layer.color !== 'number') {
      console.warn('[DEBUG] Invalid layer color:', layer);
      return false;
    }

    if (layer.lineType !== undefined && typeof layer.lineType !== 'string') {
      console.warn('[DEBUG] Invalid layer line type:', layer);
      return false;
    }

    if (layer.lineWeight !== undefined && typeof layer.lineWeight !== 'number') {
      console.warn('[DEBUG] Invalid layer line weight:', layer);
      return false;
    }

    return true;
  }

  /**
   * Filter visible layers
   */
  static getVisibleLayers(layers: DxfLayer[]): string[] {
    return layers
      .filter(layer => !layer.off && !layer.frozen)
      .map(layer => layer.name);
  }

  /**
   * Get layer attributes
   */
  static getLayerAttributes(name: string): Partial<DxfLayer> {
    const layer = this.getLayer(name);
    if (!layer) {
      return {};
    }

    return {
      color: layer.color,
      lineType: layer.lineType,
      lineWeight: layer.lineWeight
    };
  }
}

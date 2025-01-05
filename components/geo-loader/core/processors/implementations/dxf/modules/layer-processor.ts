import { DxfLayer } from '../types';

export class DxfLayerProcessor {
  private static layerCache = new Map<string, DxfLayer>();
  private static readonly SYSTEM_LAYERS = ['handle', 'ownerHandle', 'layers'];

  /**
   * Extract layer names from layer data
   */
  static extractLayerNames(layerData: Record<string, any>): string[] {
    // Initial data inspection
    console.debug('[LAYER_DEBUG] Starting layer extraction with raw data:', {
      keys: Object.keys(layerData),
      rawData: layerData,
      dataType: typeof layerData,
      isArray: Array.isArray(layerData)
    });

    const layerNames = new Set<string>();
    layerNames.add('0'); // Always include default layer
    console.debug('[LAYER_DEBUG] Added default layer "0"');

    // Validate input structure
    if (!layerData || typeof layerData !== 'object') {
      console.warn('[LAYER_DEBUG] Invalid layer data structure:', { layerData });
      return ['0']; // Return only default layer if data is invalid
    }

    // Process layer data
    Object.entries(layerData).forEach(([name, data]) => {
      // Detailed inspection of each potential layer
      console.debug('[LAYER_DEBUG] Processing potential layer:', {
        name,
        rawData: data,
        dataType: typeof data,
        hasName: data?.name !== undefined,
        isSystemLayer: this.isSystemLayer(name),
        isValid: this.validateLayer(data)
      });

      if (!this.isSystemLayer(name) && this.validateLayer(data)) {
        layerNames.add(name);
        console.debug('[LAYER_DEBUG] Added layer:', name);
      } else {
        console.debug('[LAYER_DEBUG] Skipped layer:', {
          name,
          reason: this.isSystemLayer(name) ? 'system layer' : 'invalid layer data'
        });
      }
    });

    const layers = Array.from(layerNames);
    console.debug('[LAYER_DEBUG] Final layer list:', {
      count: layers.length,
      layers,
      setContents: Array.from(layerNames)
    });
    
    return layers;
  }

  /**
   * Check if layer name is a system layer
   */
  private static isSystemLayer(name: string): boolean {
    const isSystem = this.SYSTEM_LAYERS.includes(name);
    console.debug('[LAYER_DEBUG] System layer check:', {
      name,
      isSystem,
      systemLayers: this.SYSTEM_LAYERS
    });
    return isSystem;
  }

  /**
   * Validate layer data
   */
  private static validateLayer(layer: any): boolean {
    // Basic type validation
    if (!layer || typeof layer !== 'object') {
      console.debug('[LAYER_DEBUG] Layer validation failed: not an object', {
        layer,
        type: typeof layer
      });
      return false;
    }

    // Check if it's a valid layer object
    const validationChecks = {
      hasValidName: typeof layer.name === 'string' && layer.name.length > 0,
      hasValidColor: layer.color === undefined || typeof layer.color === 'number',
      hasValidLineType: layer.lineType === undefined || typeof layer.lineType === 'string',
      hasValidLineWeight: layer.lineWeight === undefined || typeof layer.lineWeight === 'number',
      hasValidFlags: {
        frozen: layer.frozen === undefined || typeof layer.frozen === 'boolean',
        locked: layer.locked === undefined || typeof layer.locked === 'boolean',
        off: layer.off === undefined || typeof layer.off === 'boolean'
      }
    };

    console.debug('[LAYER_DEBUG] Layer validation checks:', {
      layer,
      checks: validationChecks
    });

    // All checks must pass
    const isValid = validationChecks.hasValidName &&
                   validationChecks.hasValidColor &&
                   validationChecks.hasValidLineType &&
                   validationChecks.hasValidLineWeight &&
                   Object.values(validationChecks.hasValidFlags).every(flag => flag);

    if (!isValid) {
      console.debug('[LAYER_DEBUG] Layer validation failed:', {
        layer,
        failedChecks: Object.entries(validationChecks).filter(([_, value]) => 
          typeof value === 'boolean' ? !value : Object.values(value).some(v => !v)
        )
      });
    } else {
      console.debug('[LAYER_DEBUG] Layer validation passed:', { layer });
    }

    return isValid;
  }

  /**
   * Extract layer names from raw layer data, excluding system layers
   */
  static extractLayerNamesFromRaw(layerData: Record<string, any>): string[] {
    return Object.entries(layerData)
      .filter(([name, layer]) => 
        typeof layer === 'object' && 
        layer !== null && 
        !this.isSystemLayer(name))
      .map(([name, _]) => name);
  }

  /**
   * Convert raw layer data to our format, excluding system layers
   */
  static convertLayers(layers: Record<string, any>): DxfLayer[] {
    const converted = Object.entries(layers)
      .filter(([name, _]) => !this.isSystemLayer(name))
      .map(([name, layer]) => {
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
      names: converted.map(l => l.name),
      excluded: Object.keys(layers).filter(name => this.isSystemLayer(name))
    });

    return converted;
  }

  /**
   * Add layer to cache if it's not a system layer
   */
  static addLayer(layer: DxfLayer): void {
    if (!this.isSystemLayer(layer.name)) {
      this.layerCache.set(layer.name, layer);
    }
  }

  /**
   * Get layer from cache
   */
  static getLayer(name: string): DxfLayer | undefined {
    return !this.isSystemLayer(name) ? this.layerCache.get(name) : undefined;
  }

  /**
   * Get all cached layers (excluding system layers)
   */
  static getAllLayers(): DxfLayer[] {
    return Array.from(this.layerCache.values())
      .filter(layer => !this.isSystemLayer(layer.name));
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
      if (name && !name.startsWith('*') && !this.isSystemLayer(name)) { // Skip special and system layers
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
  static validateLayerData(layer: any): layer is DxfLayer {
    if (!layer || typeof layer !== 'object') {
      console.warn('[DEBUG] Invalid layer (not an object):', layer);
      return false;
    }

    if (typeof layer.name !== 'string' || !layer.name || this.isSystemLayer(layer.name)) {
      console.warn('[DEBUG] Invalid or system layer name:', layer);
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
   * Filter visible layers (excluding system layers)
   */
  static getVisibleLayers(layers: DxfLayer[]): string[] {
    return layers
      .filter(layer => !layer.off && !layer.frozen && !this.isSystemLayer(layer.name))
      .map(layer => layer.name);
  }

  /**
   * Get layer attributes for non-system layers
   */
  static getLayerAttributes(name: string): Partial<DxfLayer> {
    if (this.isSystemLayer(name)) {
      return {};
    }

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

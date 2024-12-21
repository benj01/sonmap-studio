import { DxfLayer, DxfEntity } from '../types';
import { ValidationError } from '../../../../errors/types';

interface LayerState {
  visible: boolean;
  frozen: boolean;
  locked: boolean;
}

/**
 * Manages DXF layers and their states
 */
export class LayerManager {
  private layers: Map<string, DxfLayer>;
  private layerStates: Map<string, LayerState>;
  private defaultLayer: DxfLayer = {
    name: '0',
    color: 7, // White/black
    lineType: 'CONTINUOUS'
  };

  constructor() {
    this.layers = new Map();
    this.layerStates = new Map();
    this.addLayer(this.defaultLayer);
  }

  /**
   * Parse layers from DXF content
   */
  async parseLayers(content: string): Promise<DxfLayer[]> {
    const layers: DxfLayer[] = [];
    const layerRegex = /^0\s+LAYER\s+([\s\S]*?)(?=^0\s+\w+)/gm;
    
    let match;
    while ((match = layerRegex.exec(content)) !== null) {
      try {
        const layerContent = match[1];
        const layer = this.parseLayerDefinition(layerContent);
        if (layer) {
          layers.push(layer);
          this.addLayer(layer);
        }
      } catch (error) {
        console.warn('Failed to parse layer:', error);
      }
    }

    return layers;
  }

  /**
   * Parse a single layer definition
   */
  private parseLayerDefinition(content: string): DxfLayer | null {
    const lines = content.split('\n').map(line => line.trim());
    const layer: Partial<DxfLayer> = {};

    for (let i = 0; i < lines.length; i++) {
      const code = parseInt(lines[i]);
      const value = lines[i + 1];
      
      if (isNaN(code)) continue;
      
      switch (code) {
        case 2: // Layer name
          layer.name = value;
          break;
        case 6: // Line type name
          layer.lineType = value;
          break;
        case 62: // Color number (negative means layer is off)
          const colorNumber = parseInt(value);
          layer.color = Math.abs(colorNumber);
          if (colorNumber < 0) {
            this.setLayerState(layer.name!, { visible: false });
          }
          break;
        case 70: // Layer flags
          const flags = parseInt(value);
          if (flags & 1) layer.frozen = true;
          if (flags & 4) layer.locked = true;
          break;
      }
      i++; // Skip value line
    }

    if (!layer.name) {
      return null;
    }

    return layer as DxfLayer;
  }

  /**
   * Add a layer to the manager
   */
  addLayer(layer: DxfLayer): void {
    this.layers.set(layer.name, layer);
    this.layerStates.set(layer.name, {
      visible: !layer.off,
      frozen: layer.frozen || false,
      locked: layer.locked || false
    });
  }

  /**
   * Get a layer by name
   */
  getLayer(name: string): DxfLayer {
    return this.layers.get(name) || this.defaultLayer;
  }

  /**
   * Get all layer names
   */
  getLayerNames(): string[] {
    return Array.from(this.layers.keys());
  }

  /**
   * Get all layers
   */
  getLayers(): DxfLayer[] {
    return Array.from(this.layers.values());
  }

  /**
   * Set layer state
   */
  setLayerState(name: string, state: Partial<LayerState>): void {
    const currentState = this.getLayerState(name);
    this.layerStates.set(name, { ...currentState, ...state });
  }

  /**
   * Get layer state
   */
  getLayerState(name: string): LayerState {
    return (
      this.layerStates.get(name) || {
        visible: true,
        frozen: false,
        locked: false
      }
    );
  }

  /**
   * Check if an entity should be processed based on its layer
   */
  shouldProcessEntity(entity: DxfEntity): boolean {
    const layerName = entity.attributes.layer || '0';
    const state = this.getLayerState(layerName);
    return state.visible && !state.frozen;
  }

  /**
   * Filter entities by layer visibility
   */
  filterEntitiesByLayer(entities: DxfEntity[]): DxfEntity[] {
    return entities.filter(entity => this.shouldProcessEntity(entity));
  }

  /**
   * Get layer properties for an entity
   */
  getLayerProperties(entity: DxfEntity): {
    color?: number;
    lineType?: string;
    lineWeight?: number;
  } {
    const layerName = entity.attributes.layer || '0';
    const layer = this.getLayer(layerName);
    return {
      color: layer.color,
      lineType: layer.lineType,
      lineWeight: layer.lineWeight
    };
  }

  /**
   * Validate layer name
   */
  validateLayerName(name: string): boolean {
    // Layer names can't contain <>/\":;?*|=`
    const invalidChars = /[<>/":\\;?*|=`]/;
    return !invalidChars.test(name);
  }

  /**
   * Create a new layer
   */
  createLayer(name: string, properties: Partial<DxfLayer> = {}): DxfLayer {
    if (!this.validateLayerName(name)) {
      throw new ValidationError(
        'Invalid layer name',
        'INVALID_LAYER_NAME',
        undefined,
        { name }
      );
    }

    const layer: DxfLayer = {
      name,
      color: properties.color ?? 7,
      lineType: properties.lineType ?? 'CONTINUOUS',
      lineWeight: properties.lineWeight,
      frozen: properties.frozen || false,
      locked: properties.locked || false,
      off: properties.off || false
    };

    this.addLayer(layer);
    return layer;
  }

  /**
   * Reset all layer states
   */
  resetLayerStates(): void {
    for (const [name, layer] of this.layers) {
      this.layerStates.set(name, {
        visible: !layer.off,
        frozen: layer.frozen || false,
        locked: layer.locked || false
      });
    }
  }

  /**
   * Clear all layers
   */
  clear(): void {
    this.layers.clear();
    this.layerStates.clear();
    this.addLayer(this.defaultLayer);
  }
}

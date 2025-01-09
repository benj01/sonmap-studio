import { StreamProcessorState } from '../types/stream';
import { DxfEntity } from '../types';

interface ProcessorState extends StreamProcessorState {
  features: DxfEntity[];
}

interface StatisticsError {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * State manager for DXF processor
 */
export class StateManager {
  private state: ProcessorState;
  private readonly SYSTEM_PROPERTIES = new Set([
    'handle',
    'ownerHandle',
    'layers',
    '$EXTMIN',
    '$EXTMAX',
    '$LIMMIN',
    '$LIMMAX'
  ]);

  constructor() {
    this.state = this.createInitialState();
  }

  /**
   * Create initial processor state
   */
  private createInitialState(): ProcessorState {
    return {
      isProcessing: false,
      progress: 0,
      featuresProcessed: 0,
      chunksProcessed: 0,
      statistics: {
        featureCount: 0,
        layerCount: 0,
        featureTypes: {},
        failedTransformations: 0,
        errors: []
      },
      features: []
    };
  }

  /**
   * Get current state
   */
  getState(): ProcessorState {
    return this.state;
  }

  /**
   * Update processing state
   */
  setProcessing(isProcessing: boolean): void {
    this.state.isProcessing = isProcessing;
  }

  /**
   * Update progress
   */
  updateProgress(progress: number): void {
    this.state.progress = Math.min(1, Math.max(0, progress));
  }

  /**
   * Update features processed count
   */
  updateFeaturesProcessed(count: number): void {
    this.state.featuresProcessed = count;
  }

  /**
   * Update chunks processed count
   */
  updateChunksProcessed(count: number): void {
    this.state.chunksProcessed = count;
  }

  /**
   * Update feature statistics
   */
  updateStatistics(updates: Partial<typeof this.state.statistics>): void {
    this.state.statistics = {
      ...this.state.statistics,
      ...updates
    };
  }

  /**
   * Update feature type count
   */
  incrementFeatureType(type: string): void {
    const count = this.state.statistics.featureTypes[type] || 0;
    this.state.statistics.featureTypes[type] = count + 1;
  }

  /**
   * Increment failed transformations count
   */
  incrementFailedTransformations(): void {
    this.state.statistics.failedTransformations++;
  }

  /**
   * Add error to statistics
   */
  addError(error: StatisticsError): void {
    this.state.statistics.errors.push(error);
  }

  /**
   * Set current features
   */
  setFeatures(features: DxfEntity[]): void {
    this.state.features = features;
    this.updateStatistics({
      featureCount: features.length
    });
  }

  /**
   * Get available layers from current state
   */
  getLayers(): string[] {
    const layerSet = new Set<string>();
    this.state.features.forEach((entity: DxfEntity) => {
      const layer = entity.attributes?.layer || '0';
      if (!this.isSystemProperty(layer)) {
        layerSet.add(layer);
      }
    });
    return Array.from(layerSet);
  }

  /**
   * Check if a layer name represents a system property
   */
  private isSystemProperty(layerName: string | undefined): boolean {
    if (!layerName) return false;
    return this.SYSTEM_PROPERTIES.has(layerName);
  }

  /**
   * Reset state to initial values
   */
  reset(): void {
    this.state = this.createInitialState();
  }

  /**
   * Get current statistics
   */
  getStatistics(): typeof this.state.statistics {
    return { ...this.state.statistics };
  }

  /**
   * Get current features
   */
  getFeatures(): DxfEntity[] {
    return [...this.state.features];
  }

  /**
   * Get current progress
   */
  getProgress(): number {
    return this.state.progress;
  }

  /**
   * Check if processing is active
   */
  isProcessing(): boolean {
    return this.state.isProcessing;
  }
}

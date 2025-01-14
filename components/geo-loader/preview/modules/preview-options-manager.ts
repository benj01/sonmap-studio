import { PreviewOptions } from '../types/preview';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { Bounds } from '../../core/feature-manager/bounds';

export class PreviewOptionsManager {
  private static readonly DEFAULT_MAX_FEATURES = 1000;
  private static readonly DEFAULT_SWISS_BOUNDS: [number, number, number, number] = [
    2485000, 1075000, 2834000, 1299000
  ];
  private static readonly DEFAULT_WGS84_BOUNDS: [number, number, number, number] = [
    -180, -90, 180, 90
  ];

  private options: Required<PreviewOptions>;

  constructor(initialOptions: PreviewOptions = {}) {
    const defaultOptions: Required<PreviewOptions> = {
      maxFeatures: PreviewOptionsManager.DEFAULT_MAX_FEATURES,
      coordinateSystem: COORDINATE_SYSTEMS.SWISS_LV95,
      visibleLayers: [],
      viewportBounds: PreviewOptionsManager.DEFAULT_SWISS_BOUNDS,
      enableCaching: true,
      smartSampling: true,
      analysis: { warnings: [] },
      initialBounds: null as unknown as Required<Bounds>,
      onProgress: () => {},
      selectedElement: ''
    };

    const visibleLayers = Array.isArray(initialOptions.visibleLayers)
      ? initialOptions.visibleLayers
      : defaultOptions.visibleLayers;

    this.options = {
      ...defaultOptions,
      ...initialOptions,
      viewportBounds: initialOptions.viewportBounds ?? defaultOptions.viewportBounds,
      initialBounds: initialOptions.initialBounds ?? defaultOptions.initialBounds,
      visibleLayers,
      selectedElement: initialOptions.selectedElement ?? defaultOptions.selectedElement
    };

    console.debug('[PreviewOptionsManager] Configuration finalized:', {
      finalOptions: this.options,
      useStreaming: this.options.maxFeatures > 10000,
      cacheEnabled: this.options.enableCaching
    });
  }

  public updateOptions(newOptions: Partial<PreviewOptions>): {
    layersChanged: boolean;
    viewportChanged: boolean;
    coordinateSystemChanged: boolean;
  } {
    const oldOptions = { ...this.options };
    
    // Update options
    this.options = {
      ...this.options,
      ...newOptions
    };

    // Check what changed
    const layersChanged = this.hasLayersChanged(oldOptions.visibleLayers, this.options.visibleLayers);
    const viewportChanged = this.hasViewportChanged(oldOptions.viewportBounds, this.options.viewportBounds);
    const coordinateSystemChanged = oldOptions.coordinateSystem !== this.options.coordinateSystem;

    if (layersChanged || viewportChanged || coordinateSystemChanged) {
      console.debug('[PreviewOptionsManager] Options updated:', {
        layersChanged,
        viewportChanged,
        coordinateSystemChanged,
        old: oldOptions,
        new: this.options
      });
    }

    return {
      layersChanged,
      viewportChanged,
      coordinateSystemChanged
    };
  }

  private hasLayersChanged(oldLayers: string[], newLayers: string[]): boolean {
    if (!oldLayers || !newLayers) return true;
    if (oldLayers.length !== newLayers.length) return true;
    return oldLayers.some(layer => !newLayers.includes(layer));
  }

  private hasViewportChanged(
    oldBounds?: [number, number, number, number],
    newBounds?: [number, number, number, number]
  ): boolean {
    if (!oldBounds || !newBounds) return true;
    return oldBounds.some((value, index) => value !== newBounds[index]);
  }

  public getOptions(): Required<PreviewOptions> {
    return { ...this.options };
  }

  public getMaxFeatures(): number {
    return this.options.maxFeatures;
  }

  public getVisibleLayers(): string[] {
    return [...this.options.visibleLayers];
  }

  public getCoordinateSystem(): string {
    return this.options.coordinateSystem;
  }

  public isSwissSystem(): boolean {
    return this.options.coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95;
  }

  public isCachingEnabled(): boolean {
    return this.options.enableCaching;
  }

  public isSmartSamplingEnabled(): boolean {
    return this.options.smartSampling;
  }

  public getViewportBounds(): [number, number, number, number] {
    return [...this.options.viewportBounds];
  }

  public getInitialBounds(): Bounds | null {
    return this.options.initialBounds ? { ...this.options.initialBounds } : null;
  }

  public getDefaultBounds(): [number, number, number, number] {
    return this.isSwissSystem() 
      ? PreviewOptionsManager.DEFAULT_SWISS_BOUNDS 
      : PreviewOptionsManager.DEFAULT_WGS84_BOUNDS;
  }

  public reset(): void {
    this.options = {
      maxFeatures: PreviewOptionsManager.DEFAULT_MAX_FEATURES,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      visibleLayers: [],
      viewportBounds: PreviewOptionsManager.DEFAULT_WGS84_BOUNDS,
      enableCaching: true,
      smartSampling: true,
      analysis: { warnings: [] },
      initialBounds: null as unknown as Required<Bounds>,
      onProgress: () => {},
      selectedElement: ''
    };
  }
}

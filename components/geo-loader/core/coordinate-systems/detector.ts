import { Feature, Position } from 'geojson';
import { CoordinateSystem } from '../../types/coordinates';
import { LogManager } from '../logging/log-manager';
import { COORDINATE_SYSTEM_BOUNDS, CoordinateSystemId } from './coordinate-system-manager';

export interface DetectionResult {
  system: CoordinateSystem;
  confidence: number;
  source: 'metadata' | 'coordinate-analysis' | 'location-heuristics';
  details?: string;
}

export class CoordinateSystemDetector {
  private static instance: CoordinateSystemDetector;
  private readonly logger = LogManager.getInstance();

  private constructor() {}

  public static getInstance(): CoordinateSystemDetector {
    if (!CoordinateSystemDetector.instance) {
      CoordinateSystemDetector.instance = new CoordinateSystemDetector();
    }
    return CoordinateSystemDetector.instance;
  }

  /**
   * Detects the coordinate system using all available methods in order of reliability
   */
  public async detect(
    features: Feature[],
    metadata?: { prj?: string; crs?: string | object }
  ): Promise<DetectionResult> {
    // Try metadata first (highest confidence)
    const metadataResult = await this.detectFromMetadata(metadata);
    if (metadataResult) {
      return metadataResult;
    }

    // Try coordinate analysis next
    const coordinateResult = await this.detectFromCoordinates(features);
    if (coordinateResult) {
      return coordinateResult;
    }

    // Fall back to location-based heuristics
    const heuristicResult = await this.detectFromHeuristics(features);
    if (heuristicResult) {
      return heuristicResult;
    }

    // Default to WGS84 with low confidence if all else fails
    return {
      system: 'EPSG:4326',
      confidence: 0.1,
      source: 'location-heuristics',
      details: 'Defaulting to WGS84 as no other detection method succeeded'
    };
  }

  /**
   * Detects coordinate system from file metadata (PRJ file or embedded CRS)
   */
  private async detectFromMetadata(
    metadata?: { prj?: string; crs?: string | object }
  ): Promise<DetectionResult | null> {
    if (!metadata) return null;

    try {
      if (metadata.prj) {
        // Parse PRJ file content and match against known systems
        const system = await this.parsePRJContent(metadata.prj);
        if (system) {
          return {
            system,
            confidence: 0.9,
            source: 'metadata',
            details: 'Detected from PRJ file'
          };
        }
      }

      if (metadata.crs) {
        // Parse CRS object/string and match against known systems
        const system = await this.parseCRSDefinition(metadata.crs);
        if (system) {
          return {
            system,
            confidence: 0.9,
            source: 'metadata',
            details: 'Detected from CRS definition'
          };
        }
      }
    } catch (error) {
      this.logger.error('Error detecting coordinate system from metadata:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Detects coordinate system by analyzing coordinate ranges
   */
  private async detectFromCoordinates(features: Feature[]): Promise<DetectionResult | null> {
    if (!features.length) return null;

    try {
      const bounds = this.calculateBounds(features);
      if (!bounds) return null;

      // Check each coordinate system's bounds
      for (const [systemId, systemBounds] of Object.entries(COORDINATE_SYSTEM_BOUNDS)) {
        const matchConfidence = this.calculateBoundsMatchConfidence(
          bounds,
          systemBounds,
          systemId as CoordinateSystemId
        );

        if (matchConfidence > 0.7) {
          return {
            system: systemId as CoordinateSystem,
            confidence: matchConfidence,
            source: 'coordinate-analysis',
            details: `Coordinates match ${systemId} bounds with ${(matchConfidence * 100).toFixed(1)}% confidence`
          };
        }
      }
    } catch (error) {
      this.logger.error('Error detecting coordinate system from coordinates:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Detects coordinate system using location-based heuristics
   */
  private async detectFromHeuristics(features: Feature[]): Promise<DetectionResult | null> {
    try {
      // Analyze feature patterns and density
      const { isSwiss, confidence } = this.analyzeFeaturePatterns(features);

      if (isSwiss && confidence > 0.5) {
        // Default to LV95 for Swiss coordinates as it's more modern
        return {
          system: 'EPSG:2056',
          confidence: confidence,
          source: 'location-heuristics',
          details: 'Detected Swiss coordinate pattern'
        };
      }
    } catch (error) {
      this.logger.error('Error detecting coordinate system from heuristics:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  private calculateBounds(features: Feature[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const processPosition = (position: Position) => {
      if (position.length >= 2) {
        minX = Math.min(minX, position[0]);
        minY = Math.min(minY, position[1]);
        maxX = Math.max(maxX, position[0]);
        maxY = Math.max(maxY, position[1]);
      }
    };

    for (const feature of features) {
      if (!feature.geometry) continue;

      const coords = this.extractCoordinates(feature.geometry);
      coords.forEach(processPosition);
    }

    if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }

  private extractCoordinates(geometry: any): Position[] {
    const coordinates: Position[] = [];

    const processCoordinate = (coord: any) => {
      if (Array.isArray(coord) && typeof coord[0] === 'number') {
        coordinates.push(coord as Position);
      } else if (Array.isArray(coord)) {
        coord.forEach(processCoordinate);
      }
    };

    processCoordinate(geometry.coordinates);
    return coordinates;
  }

  private calculateBoundsMatchConfidence(
    featureBounds: { minX: number; minY: number; maxX: number; maxY: number },
    systemBounds: { x: { min: number; max: number }; y: { min: number; max: number } },
    systemId: CoordinateSystemId
  ): number {
    // Calculate how well the feature bounds fit within the system bounds
    const xOverlap = Math.min(featureBounds.maxX, systemBounds.x.max) - Math.max(featureBounds.minX, systemBounds.x.min);
    const yOverlap = Math.min(featureBounds.maxY, systemBounds.y.max) - Math.max(featureBounds.minY, systemBounds.y.min);

    const featureWidth = featureBounds.maxX - featureBounds.minX;
    const featureHeight = featureBounds.maxY - featureBounds.minY;

    if (xOverlap <= 0 || yOverlap <= 0) return 0;

    const xConfidence = xOverlap / featureWidth;
    const yConfidence = yOverlap / featureHeight;

    // For Swiss systems, add additional checks
    if (systemId === 'EPSG:2056' || systemId === 'EPSG:21781') {
      return this.adjustSwissConfidence(xConfidence, yConfidence, featureBounds);
    }

    return Math.min(xConfidence, yConfidence);
  }

  private adjustSwissConfidence(
    xConfidence: number,
    yConfidence: number,
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
  ): number {
    const baseConfidence = Math.min(xConfidence, yConfidence);

    // Check if the coordinates follow Swiss numbering patterns
    const hasSwissPattern = (
      (bounds.minX >= 2000000 && bounds.maxX <= 3000000) || // LV95
      (bounds.minX >= 400000 && bounds.maxX <= 900000)     // LV03
    ) && (
      (bounds.minY >= 1000000 && bounds.maxY <= 1400000) || // LV95
      (bounds.minY >= 0 && bounds.maxY <= 400000)           // LV03
    );

    return hasSwissPattern ? baseConfidence * 1.2 : baseConfidence * 0.8;
  }

  private analyzeFeaturePatterns(features: Feature[]): { isSwiss: boolean; confidence: number } {
    let swissPatternCount = 0;
    let totalFeatures = 0;

    for (const feature of features) {
      if (!feature.geometry) continue;

      const coords = this.extractCoordinates(feature.geometry);
      if (!coords.length) continue;

      totalFeatures++;

      // Check if coordinates follow Swiss patterns
      const hasSwissPattern = coords.some(coord => {
        const [x, y] = coord;
        return (
          // LV95 pattern
          ((x >= 2000000 && x <= 3000000) && (y >= 1000000 && y <= 1400000)) ||
          // LV03 pattern
          ((x >= 400000 && x <= 900000) && (y >= 0 && y <= 400000))
        );
      });

      if (hasSwissPattern) {
        swissPatternCount++;
      }
    }

    if (totalFeatures === 0) return { isSwiss: false, confidence: 0 };

    const confidence = swissPatternCount / totalFeatures;
    return {
      isSwiss: confidence > 0.5,
      confidence: confidence
    };
  }

  private async parsePRJContent(prjContent: string): Promise<CoordinateSystem | null> {
    // TODO: Implement PRJ parsing logic
    // This would involve parsing WKT format and matching against known systems
    return null;
  }

  private async parseCRSDefinition(crs: string | object): Promise<CoordinateSystem | null> {
    // TODO: Implement CRS parsing logic
    // This would involve parsing various CRS formats (EPSG codes, proj4 strings, etc.)
    return null;
  }
} 
import { CoordinateSystem, TransformOptions, TransformResult } from './types';
import { CoordinateTransformer } from './transformer';

/**
 * Manages coordinate systems and transformations
 */
export class CoordinateManager {
  private systems: Map<string, CoordinateSystem> = new Map();
  private transformer: CoordinateTransformer;

  constructor() {
    this.transformer = new CoordinateTransformer();
  }

  /**
   * Register a coordinate system
   */
  registerSystem(system: CoordinateSystem): void {
    if (this.systems.has(system.id)) {
      throw new Error(`Coordinate system with ID ${system.id} already registered`);
    }
    this.systems.set(system.id, system);
  }

  /**
   * Register multiple coordinate systems
   */
  registerSystems(systems: CoordinateSystem[]): void {
    systems.forEach(system => this.registerSystem(system));
  }

  /**
   * Get a registered coordinate system by ID
   */
  getSystem(id: string): CoordinateSystem | undefined {
    return this.systems.get(id);
  }

  /**
   * Get a registered coordinate system by EPSG code
   */
  getSystemByEPSG(epsg: number): CoordinateSystem | undefined {
    return Array.from(this.systems.values()).find(system => system.epsg === epsg);
  }

  /**
   * Get all registered coordinate systems
   */
  getAllSystems(): CoordinateSystem[] {
    return Array.from(this.systems.values());
  }

  /**
   * Get all geographic coordinate systems
   */
  getGeographicSystems(): CoordinateSystem[] {
    return Array.from(this.systems.values()).filter(system => system.isGeographic);
  }

  /**
   * Get all projected coordinate systems
   */
  getProjectedSystems(): CoordinateSystem[] {
    return Array.from(this.systems.values()).filter(system => !system.isGeographic);
  }

  /**
   * Transform coordinates between systems
   */
  transform(
    coordinates: number[],
    fromId: string,
    toId: string,
    options: TransformOptions = {}
  ): TransformResult {
    const fromSystem = this.systems.get(fromId);
    const toSystem = this.systems.get(toId);

    if (!fromSystem) {
      return {
        coordinates,
        success: false,
        error: `Source coordinate system not found: ${fromId}`
      };
    }

    if (!toSystem) {
      return {
        coordinates,
        success: false,
        error: `Target coordinate system not found: ${toId}`
      };
    }

    return this.transformer.transform(coordinates, fromSystem, toSystem, options);
  }

  /**
   * Check if a coordinate system is registered
   */
  hasSystem(id: string): boolean {
    return this.systems.has(id);
  }

  /**
   * Remove a coordinate system
   */
  removeSystem(id: string): boolean {
    return this.systems.delete(id);
  }

  /**
   * Clear coordinate system registry and transform cache
   */
  clear(): void {
    this.systems.clear();
    this.transformer.clearCache();
  }
}

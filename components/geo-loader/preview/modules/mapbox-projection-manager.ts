import { MapboxProjection } from '../types/mapbox';

export class MapboxProjectionManager {
  private projection: MapboxProjection;

  constructor() {
    // Initialize with default Swiss-centric configuration
    this.projection = {
      name: 'mercator',
      center: [8.2275, 46.8182], // Center of Switzerland
      parallels: [45.8, 47.8] // Typical for Switzerland
    };
  }

  public setProjection(newProjection: Partial<MapboxProjection>): boolean {
    const oldProjection = { ...this.projection };
    
    this.projection = {
      ...this.projection,
      ...newProjection
    };

    return this.hasProjectionChanged(oldProjection, this.projection);
  }

  public getProjection(): MapboxProjection {
    return { ...this.projection };
  }

  private hasProjectionChanged(old: MapboxProjection, current: MapboxProjection): boolean {
    return old.name !== current.name ||
           old.center[0] !== current.center[0] ||
           old.center[1] !== current.center[1] ||
           old.parallels?.[0] !== current.parallels?.[0] ||
           old.parallels?.[1] !== current.parallels?.[1];
  }

  public getProjectionInfo() {
    return {
      display: this.projection.name,
      center: this.projection.center,
      parallels: this.projection.parallels
    };
  }

  public isGlobeProjection(): boolean {
    return this.projection.name === 'globe';
  }

  public isConformalProjection(): boolean {
    return this.projection.name === 'lambertConformalConic';
  }

  public requiresParallels(): boolean {
    return ['albers', 'lambertConformalConic'].includes(this.projection.name);
  }

  public getDefaultCenter(): [number, number] {
    return [8.2275, 46.8182]; // Switzerland center
  }

  public getDefaultParallels(): [number, number] {
    return [45.8, 47.8]; // Switzerland parallels
  }
}

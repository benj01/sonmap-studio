import { Feature, Position } from 'geojson';
import { DensityAnalysis, GeoBounds } from './types';
import { Logger } from '../../../../../utils/logger';

interface GridCell {
  bounds: GeoBounds;
  count: number;
  density: number;
}

export class DensityAnalyzer {
  private readonly LOG_SOURCE = 'DensityAnalyzer';
  private readonly DEFAULT_GRID_SIZE = 10;

  constructor(
    private readonly logger: Logger
  ) {}

  /**
   * Analyze feature density using a grid-based approach
   */
  public analyze(features: Feature[], gridSize: number = this.DEFAULT_GRID_SIZE): DensityAnalysis {
    this.logger.debug(this.LOG_SOURCE, 'Starting density analysis', {
      featureCount: features.length,
      gridSize
    });

    try {
      // Step 1: Calculate dataset bounds
      const bounds = this.calculateBounds(features);
      
      // Step 2: Create grid
      const grid = this.createGrid(bounds, gridSize);
      
      // Step 3: Assign features to grid cells
      this.assignFeaturesToGrid(features, grid);
      
      // Step 4: Calculate densities
      const cells = this.calculateGridDensities(grid);
      
      // Step 5: Identify hotspots and sparse areas
      const { hotspots, sparseAreas } = this.identifyDensityAreas(cells);

      const overallDensity = features.length / this.calculateArea(bounds);

      return {
        overallDensity,
        hotspots,
        sparseAreas
      };
    } catch (error) {
      this.logger.error(this.LOG_SOURCE, 'Density analysis failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Calculate bounds of all features
   */
  private calculateBounds(features: Feature[]): GeoBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    features.forEach(feature => {
      const coords = this.getFeatureCoordinates(feature);
      coords.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
    });

    return { minX, minY, maxX, maxY };
  }

  /**
   * Create a grid of cells covering the bounds
   */
  private createGrid(bounds: GeoBounds, gridSize: number): GridCell[][] {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    const grid: GridCell[][] = [];

    for (let i = 0; i < gridSize; i++) {
      grid[i] = [];
      for (let j = 0; j < gridSize; j++) {
        grid[i][j] = {
          bounds: {
            minX: bounds.minX + (j * cellWidth),
            minY: bounds.minY + (i * cellHeight),
            maxX: bounds.minX + ((j + 1) * cellWidth),
            maxY: bounds.minY + ((i + 1) * cellHeight)
          },
          count: 0,
          density: 0
        };
      }
    }

    return grid;
  }

  /**
   * Assign features to grid cells
   */
  private assignFeaturesToGrid(features: Feature[], grid: GridCell[][]): void {
    features.forEach(feature => {
      const coords = this.getFeatureCoordinates(feature);
      const cells = new Set<GridCell>();

      coords.forEach(([x, y]) => {
        const cell = this.findCell(grid, x, y);
        if (cell) cells.add(cell);
      });

      cells.forEach(cell => cell.count++);
    });
  }

  /**
   * Calculate density for each grid cell
   */
  private calculateGridDensities(grid: GridCell[][]): GridCell[] {
    const cells: GridCell[] = [];

    grid.forEach(row => {
      row.forEach(cell => {
        const area = this.calculateArea(cell.bounds);
        cell.density = cell.count / area;
        cells.push(cell);
      });
    });

    return cells;
  }

  /**
   * Identify areas of high and low density
   */
  private identifyDensityAreas(cells: GridCell[]): {
    hotspots: Array<{ bounds: GeoBounds; density: number }>;
    sparseAreas: Array<{ bounds: GeoBounds; density: number }>;
  } {
    const densities = cells.map(cell => cell.density);
    const mean = this.calculateMean(densities);
    const stdDev = this.calculateStdDev(densities, mean);

    const hotspots = cells
      .filter(cell => cell.density > mean + stdDev)
      .map(cell => ({
        bounds: cell.bounds,
        density: cell.density
      }));

    const sparseAreas = cells
      .filter(cell => cell.density < mean - stdDev && cell.density > 0)
      .map(cell => ({
        bounds: cell.bounds,
        density: cell.density
      }));

    return { hotspots, sparseAreas };
  }

  // Helper methods

  private getFeatureCoordinates(feature: Feature): [number, number][] {
    const coords: [number, number][] = [];
    
    if (!feature.geometry) return coords;

    switch (feature.geometry.type) {
      case 'Point':
        coords.push(feature.geometry.coordinates as [number, number]);
        break;
      case 'LineString':
        coords.push(...(feature.geometry.coordinates as [number, number][]));
        break;
      case 'Polygon':
        feature.geometry.coordinates[0].forEach((coord: Position) => {
          coords.push([coord[0], coord[1]]);
        });
        break;
      // Add more geometry types as needed
    }

    return coords;
  }

  private findCell(grid: GridCell[][], x: number, y: number): GridCell | null {
    for (const row of grid) {
      for (const cell of row) {
        if (
          x >= cell.bounds.minX &&
          x <= cell.bounds.maxX &&
          y >= cell.bounds.minY &&
          y <= cell.bounds.maxY
        ) {
          return cell;
        }
      }
    }
    return null;
  }

  private calculateArea(bounds: GeoBounds): number {
    return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
  }

  private calculateMean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private calculateStdDev(values: number[], mean: number): number {
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = this.calculateMean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }
} 
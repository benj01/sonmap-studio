import simplify from 'simplify-js';

interface Point {
  x: number;
  y: number;
  z?: number;
  [key: string]: any;
}

export class PointCloudOptimizer {
  /**
   * Simplify a point cloud using the Ramer-Douglas-Peucker algorithm
   */
  static simplifyPoints(
    points: Point[],
    tolerance: number,
    preserveProperties = true
  ): Point[] {
    if (tolerance <= 0) return points;

    // Convert points to format expected by simplify-js
    const simplifyPoints = points.map((p, i) => ({
      x: p.x,
      y: p.y,
      originalIndex: i,
    }));

    // Perform simplification
    const simplified = simplify(simplifyPoints, tolerance, true);

    // If preserving properties, map back the original properties
    if (preserveProperties) {
      return simplified.map((p) => ({
        ...points[(p as any).originalIndex],
        x: p.x,
        y: p.y,
      }));
    }

    return simplified as Point[];
  }

  /**
   * Grid-based point cloud thinning
   */
  static gridThinning(
    points: Point[],
    cellSize: number,
    aggregationType: 'first' | 'average' = 'first'
  ): Point[] {
    const grid: { [key: string]: Point[] } = {};

    // Assign points to grid cells
    points.forEach((point) => {
      const cellX = Math.floor(point.x / cellSize);
      const cellY = Math.floor(point.y / cellSize);
      const cellKey = `${cellX},${cellY}`;

      if (!grid[cellKey]) {
        grid[cellKey] = [];
      }
      grid[cellKey].push(point);
    });

    // Process each cell according to aggregation type
    return Object.values(grid).map((cellPoints) => {
      if (aggregationType === 'first') {
        return cellPoints[0];
      } else {
        // Average points in cell
        const sum = cellPoints.reduce(
          (acc, p) => ({
            x: acc.x + p.x,
            y: acc.y + p.y,
            z: acc.z + (p.z || 0),
          }),
          { x: 0, y: 0, z: 0 }
        );

        const count = cellPoints.length;
        return {
          x: sum.x / count,
          y: sum.y / count,
          z: sum.z / count,
          // Preserve other properties from the first point
          ...cellPoints[0],
        };
      }
    });
  }

  /**
   * Optimize point cloud based on distance
   */
  static distanceBasedThinning(
    points: Point[],
    minDistance: number
  ): Point[] {
    const result: Point[] = [];
    const used = new Set<number>();

    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;

      result.push(points[i]);
      used.add(i);

      // Mark nearby points as used
      for (let j = i + 1; j < points.length; j++) {
        if (used.has(j)) continue;

        const distance = Math.sqrt(
          Math.pow(points[i].x - points[j].x, 2) +
          Math.pow(points[i].y - points[j].y, 2)
        );

        if (distance < minDistance) {
          used.add(j);
        }
      }
    }

    return result;
  }
}

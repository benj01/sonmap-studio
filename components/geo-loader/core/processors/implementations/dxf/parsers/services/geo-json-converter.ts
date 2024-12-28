import { Feature } from 'geojson';
import { DxfEntity } from '../../types';
import { generateArcPoints, toRadians } from '../utils/point-utils';

export class GeoJsonConverter {
  /**
   * Convert entities to GeoJSON features
   */
  public convertToFeatures(entities: DxfEntity[]): Feature[] {
    return entities
      .map(entity => this.entityToFeature(entity))
      .filter((feature): feature is Feature => feature !== null);
  }

  private entityToFeature(entity: DxfEntity): Feature | null {
    try {
      switch (entity.type.toUpperCase()) {
        case 'POINT':
          return this.pointToFeature(entity);
        case 'LINE':
          return this.lineToFeature(entity);
        case 'POLYLINE':
        case 'LWPOLYLINE':
          return this.polylineToFeature(entity);
        case 'CIRCLE':
          return this.circleToFeature(entity);
        case 'ARC':
          return this.arcToFeature(entity);
        case 'ELLIPSE':
          return this.ellipseToFeature(entity);
        case 'SPLINE':
          return this.splineToFeature(entity);
        case 'TEXT':
        case 'MTEXT':
          return this.textToFeature(entity);
        default:
          return null;
      }
    } catch (error) {
      console.warn('Failed to convert entity to feature:', error);
      return null;
    }
  }

  private pointToFeature(entity: DxfEntity): Feature | null {
    if (typeof entity.data.x === 'number' && typeof entity.data.y === 'number') {
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [entity.data.x, entity.data.y]
        },
        properties: {
          type: entity.type,
          ...entity.attributes
        }
      };
    }
    return null;
  }

  private lineToFeature(entity: DxfEntity): Feature | null {
    if (typeof entity.data.x === 'number' && typeof entity.data.y === 'number' &&
        typeof entity.data.x2 === 'number' && typeof entity.data.y2 === 'number') {
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [entity.data.x, entity.data.y],
            [entity.data.x2, entity.data.y2]
          ]
        },
        properties: {
          type: entity.type,
          ...entity.attributes
        }
      };
    }
    return null;
  }

  private polylineToFeature(entity: DxfEntity): Feature | null {
    if (!Array.isArray(entity.data.vertices) || entity.data.vertices.length < 2) {
      return null;
    }

    const coordinates = entity.data.vertices.map((v: any) => [v.x, v.y]);
    const isClosed = entity.data.closed || 
                    (coordinates.length >= 3 && 
                     coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
                     coordinates[0][1] === coordinates[coordinates.length - 1][1]);

    if (isClosed && coordinates.length >= 3) {
      if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
          coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
        coordinates.push([...coordinates[0]]);
      }
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        },
        properties: {
          type: entity.type,
          ...entity.attributes
        }
      };
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates
      },
      properties: {
        type: entity.type,
        ...entity.attributes
      }
    };
  }

  private circleToFeature(entity: DxfEntity): Feature | null {
    if (typeof entity.data.x === 'number' && 
        typeof entity.data.y === 'number' && 
        typeof entity.data.radius === 'number') {
      const coordinates = generateArcPoints(
        { x: entity.data.x, y: entity.data.y, z: entity.data.z || 0 },
        entity.data.radius,
        0,
        Math.PI * 2
      );
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        },
        properties: {
          type: entity.type,
          ...entity.attributes
        }
      };
    }
    return null;
  }

  private arcToFeature(entity: DxfEntity): Feature | null {
    if (typeof entity.data.x === 'number' && 
        typeof entity.data.y === 'number' && 
        typeof entity.data.radius === 'number' &&
        typeof entity.data.startAngle === 'number' &&
        typeof entity.data.endAngle === 'number') {
      const coordinates = generateArcPoints(
        { x: entity.data.x, y: entity.data.y, z: entity.data.z || 0 },
        entity.data.radius,
        toRadians(entity.data.startAngle),
        toRadians(entity.data.endAngle)
      );
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates
        },
        properties: {
          type: entity.type,
          ...entity.attributes
        }
      };
    }
    return null;
  }

  private ellipseToFeature(entity: DxfEntity): Feature | null {
    if (typeof entity.data.x === 'number' && 
        typeof entity.data.y === 'number' &&
        typeof entity.data.majorAxis === 'object' &&
        typeof entity.data.ratio === 'number') {
      const majorAxis = entity.data.majorAxis as { x: number; y: number; z: number };
      const majorRadius = Math.sqrt(majorAxis.x * majorAxis.x + majorAxis.y * majorAxis.y);
      const minorRadius = majorRadius * entity.data.ratio;
      const rotation = Math.atan2(majorAxis.y, majorAxis.x);
      const startAngle = typeof entity.data.startAngle === 'number' ? entity.data.startAngle : 0;
      const endAngle = typeof entity.data.endAngle === 'number' ? entity.data.endAngle : Math.PI * 2;

      const points = 32;
      const coordinates: [number, number][] = [];

      for (let i = 0; i <= points; i++) {
        const angle = startAngle + (i / points) * (endAngle - startAngle);
        const x = entity.data.x + 
                 Math.cos(angle) * majorRadius * Math.cos(rotation) - 
                 Math.sin(angle) * minorRadius * Math.sin(rotation);
        const y = entity.data.y + 
                 Math.cos(angle) * majorRadius * Math.sin(rotation) + 
                 Math.sin(angle) * minorRadius * Math.cos(rotation);
        coordinates.push([x, y]);
      }

      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        },
        properties: {
          type: entity.type,
          ...entity.attributes
        }
      };
    }
    return null;
  }

  private splineToFeature(entity: DxfEntity): Feature | null {
    if (Array.isArray(entity.data.controlPoints) && entity.data.controlPoints.length >= 2) {
      const coordinates = entity.data.controlPoints.map((p: any) => [p.x, p.y]);
      
      if (entity.data.closed) {
        coordinates.push(coordinates[0]);
      }

      return {
        type: 'Feature',
        geometry: entity.data.closed && coordinates.length >= 4 ? 
          {
            type: 'Polygon',
            coordinates: [coordinates]
          } :
          {
            type: 'LineString',
            coordinates
          },
        properties: {
          type: entity.type,
          degree: entity.data.degree,
          ...entity.attributes
        }
      };
    }
    return null;
  }

  private textToFeature(entity: DxfEntity): Feature | null {
    if (typeof entity.data.x === 'number' && 
        typeof entity.data.y === 'number' &&
        typeof entity.data.text === 'string') {
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [entity.data.x, entity.data.y]
        },
        properties: {
          type: entity.type,
          text: entity.data.text,
          height: entity.data.height,
          rotation: entity.data.rotation,
          width: entity.data.width,
          ...entity.attributes
        }
      };
    }
    return null;
  }
}

import { DxfConverter } from '../../../utils/dxf/converter';
import { createMockErrorReporter } from '../../test-utils';
import { ErrorReporter } from '../../../utils/errors';
import { DxfEntity, DxfPointEntity, DxfLineEntity, DxfPolylineEntity, DxfCircleEntity, DxfTextEntity, DxfArcEntity, DxfEllipseEntity } from '../../../utils/dxf/types';
import { MockErrorReporter } from '../../test-utils';
import { Point, LineString, Polygon } from 'geojson';

describe('DxfConverter', () => {
  let errorReporter: MockErrorReporter;
  let converter: DxfConverter;

  beforeEach(() => {
    errorReporter = createMockErrorReporter();
    converter = new DxfConverter(errorReporter);
  });

  describe('entityToGeoFeature', () => {
    it('should convert POINT entity to Point geometry', () => {
      const entity: DxfPointEntity = {
        type: 'POINT',
        layer: '0',
        position: { x: 1, y: 2, z: 0 }
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeDefined();
      expect(feature?.geometry.type).toBe('Point');
      expect((feature?.geometry as Point).coordinates).toEqual([1, 2]);
      expect(feature?.properties.type).toBe('POINT');
      expect(feature?.properties.layer).toBe('0');
    });

    it('should convert LINE entity to LineString geometry', () => {
      const entity: DxfLineEntity = {
        type: 'LINE',
        layer: '0',
        start: { x: 1, y: 2, z: 0 },
        end: { x: 3, y: 4, z: 0 }
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeDefined();
      expect(feature?.geometry.type).toBe('LineString');
      expect((feature?.geometry as LineString).coordinates).toEqual([[1, 2], [3, 4]]);
    });

    it('should convert open POLYLINE to LineString geometry', () => {
      const entity: DxfPolylineEntity = {
        type: 'POLYLINE',
        layer: '0',
        vertices: [
          { x: 1, y: 2, z: 0 },
          { x: 3, y: 4, z: 0 },
          { x: 5, y: 6, z: 0 }
        ],
        closed: false
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeDefined();
      expect(feature?.geometry.type).toBe('LineString');
      expect((feature?.geometry as LineString).coordinates).toEqual([[1, 2], [3, 4], [5, 6]]);
    });

    it('should convert closed POLYLINE to Polygon geometry', () => {
      const entity: DxfPolylineEntity = {
        type: 'POLYLINE',
        layer: '0',
        vertices: [
          { x: 1, y: 2, z: 0 },
          { x: 3, y: 4, z: 0 },
          { x: 5, y: 6, z: 0 }
        ],
        closed: true
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeDefined();
      expect(feature?.geometry.type).toBe('Polygon');
      const coords = (feature?.geometry as Polygon).coordinates;
      expect(coords[0][0]).toEqual([1, 2]);
      expect(coords[0][coords[0].length - 1]).toEqual([1, 2]); // Should close the polygon
    });

    it('should convert CIRCLE to Polygon geometry', () => {
      const entity: DxfCircleEntity = {
        type: 'CIRCLE',
        layer: '0',
        center: { x: 0, y: 0, z: 0 },
        radius: 1
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeDefined();
      expect(feature?.geometry.type).toBe('Polygon');
      const coords = (feature?.geometry as Polygon).coordinates;
      expect(coords[0].length).toBe(33); // 32 segments + closing point
      // First and last points should be the same (closed polygon)
      expect(coords[0][0]).toEqual(coords[0][32]);
    });

    it('should convert TEXT entity to Point geometry with text properties', () => {
      const entity: DxfTextEntity = {
        type: 'TEXT',
        layer: '0',
        position: { x: 1, y: 2, z: 0 },
        text: 'Hello',
        height: 1,
        rotation: 45,
        width: 10,
        style: 'STANDARD'
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeDefined();
      expect(feature?.geometry.type).toBe('Point');
      expect((feature?.geometry as Point).coordinates).toEqual([1, 2]);
      expect(feature?.properties.text).toBe('Hello');
      expect(feature?.properties.height).toBe(1);
      expect(feature?.properties.rotation).toBe(45);
      expect(feature?.properties.width).toBe(10);
      expect(feature?.properties.style).toBe('STANDARD');
    });

    it('should report warning for unsupported entity type', () => {
      // Create a minimal entity with an unsupported type
      const unsupportedEntity = {
        type: 'UNSUPPORTED' as const,
        layer: '0'
      } as unknown as DxfEntity;

      const feature = converter.entityToGeoFeature(unsupportedEntity);

      expect(feature).toBeNull();
      const warnings = errorReporter.getReportsByType('UNSUPPORTED_ENTITY');
      expect(warnings.length).toBe(1);
      expect(warnings[0].context).toHaveProperty('entity', unsupportedEntity);
    });

    it('should handle invalid entity data gracefully', () => {
      const entity: DxfPointEntity = {
        type: 'POINT',
        layer: '0',
        position: { x: NaN, y: NaN, z: 0 }
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeNull();
      const errors = errorReporter.getReportsByType('CONVERSION_ERROR');
      expect(errors.length).toBe(1);
      expect(errors[0].context).toHaveProperty('entity', entity);
    });

    it('should convert ARC to LineString geometry', () => {
      const entity: DxfArcEntity = {
        type: 'ARC',
        layer: '0',
        center: { x: 0, y: 0, z: 0 },
        radius: 1,
        startAngle: 0,
        endAngle: 90
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeDefined();
      expect(feature?.geometry.type).toBe('LineString');
      const coords = (feature?.geometry as LineString).coordinates;
      expect(coords.length).toBe(33); // 32 segments + 1
      // First point should be at radius,0 (0 degrees)
      expect(coords[0][0]).toBeCloseTo(1);
      expect(coords[0][1]).toBeCloseTo(0);
      // Last point should be at 0,radius (90 degrees)
      expect(coords[32][0]).toBeCloseTo(0);
      expect(coords[32][1]).toBeCloseTo(1);
    });

    it('should convert ELLIPSE to LineString geometry', () => {
      const entity: DxfEllipseEntity = {
        type: 'ELLIPSE',
        layer: '0',
        center: { x: 0, y: 0, z: 0 },
        majorAxis: { x: 2, y: 0, z: 0 },
        minorAxisRatio: 0.5,
        startAngle: 0,
        endAngle: 360
      };

      const feature = converter.entityToGeoFeature(entity);

      expect(feature).toBeDefined();
      expect(feature?.geometry.type).toBe('LineString');
      const coords = (feature?.geometry as LineString).coordinates;
      expect(coords.length).toBe(33); // 32 segments + 1
      // Points should form an ellipse
      const firstPoint = coords[0];
      const lastPoint = coords[32];
      expect(firstPoint[0]).toBeCloseTo(lastPoint[0]);
      expect(firstPoint[1]).toBeCloseTo(lastPoint[1]);
    });
  });
});

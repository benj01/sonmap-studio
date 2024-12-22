import { DxfProcessor } from '../../core/processors/implementations/dxf/processor';
import { ProcessorOptions } from '../../core/processors/base/types';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { ValidationError, ParseError } from '../../core/errors/types';
import { Feature, Geometry, Position, Point, LineString, Polygon } from 'geojson';

// Helper functions for type checking
function isPoint(geometry: Geometry): geometry is Point {
  return geometry.type === 'Point';
}

function isLineString(geometry: Geometry): geometry is LineString {
  return geometry.type === 'LineString';
}

function isPolygon(geometry: Geometry): geometry is Polygon {
  return geometry.type === 'Polygon';
}

describe('DxfProcessor', () => {
  let processor: DxfProcessor;
  
  beforeEach(() => {
    processor = new DxfProcessor();
  });

  describe('file type detection', () => {
    test('should detect DXF files', async () => {
      expect(await processor.canProcess(new File([''], 'test.dxf'))).toBe(true);
      expect(await processor.canProcess(new File([''], 'test.txt'))).toBe(false);
    });
  });

  describe('DXF structure validation', () => {
    test('should validate basic DXF structure', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.analyze(file);
      expect(result.layers).toEqual(['0']); // Default layer
    });

    test('should handle invalid DXF structure', async () => {
      const content = 'invalid content';
      const file = new File([content], 'test.dxf');
      
      await expect(processor.analyze(file)).rejects.toThrow(ValidationError);
    });

    test('should handle empty DXF file', async () => {
      const file = new File([''], 'test.dxf');
      await expect(processor.analyze(file)).rejects.toThrow(ValidationError);
    });

    test('should handle indented DXF content', async () => {
      const content = `  0\n  SECTION\n  2\n  ENTITIES\n  0\n  POINT\n  10\n  1\n  20\n  2\n  0\n  ENDSEC\n  0\n  EOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.analyze(file);
      expect(result.preview.features).toHaveLength(1);
      
      const geometry = result.preview.features[0].geometry;
      expect(isPoint(geometry)).toBe(true);
      if (isPoint(geometry)) {
        expect(geometry.coordinates).toEqual([1, 2]);
      }
    });

    test('should handle empty lines between group codes', async () => {
      const content = `0\n\nSECTION\n\n2\n\nENTITIES\n\n0\n\nPOINT\n\n10\n\n1\n\n20\n\n2\n\n0\n\nENDSEC\n\n0\n\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.analyze(file);
      expect(result.preview.features).toHaveLength(1);
      
      const geometry = result.preview.features[0].geometry;
      expect(isPoint(geometry)).toBe(true);
      if (isPoint(geometry)) {
        expect(geometry.coordinates).toEqual([1, 2]);
      }
    });

    test('should handle mixed line endings', async () => {
      const content = `0\r\nSECTION\r2\nENTITIES\n0\rPOINT\r\n10\n1\r20\r\n2\n0\rENDSEC\r\n0\nEOF`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.analyze(file);
      expect(result.preview.features).toHaveLength(1);
      
      const geometry = result.preview.features[0].geometry;
      expect(isPoint(geometry)).toBe(true);
      if (isPoint(geometry)) {
        expect(geometry.coordinates).toEqual([1, 2]);
      }
    });
  });

  describe('entity conversion', () => {
    test('should convert POINT entities', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n10\n1\n20\n2\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.process(file);
      expect(result.features.features).toHaveLength(1);
      
      const geometry = result.features.features[0].geometry;
      expect(isPoint(geometry)).toBe(true);
      if (isPoint(geometry)) {
        expect(geometry.coordinates).toEqual([1, 2]);
      }
    });

    test('should convert LINE entities', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n1\n20\n2\n11\n3\n21\n4\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.process(file);
      expect(result.features.features).toHaveLength(1);
      
      const geometry = result.features.features[0].geometry;
      expect(isLineString(geometry)).toBe(true);
      if (isLineString(geometry)) {
        expect(geometry.coordinates).toEqual([[1, 2], [3, 4]]);
      }
    });

    test('should convert POLYLINE entities', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n70\n1\n0\nVERTEX\n10\n1\n20\n2\n0\nVERTEX\n10\n3\n20\n4\n0\nVERTEX\n10\n5\n20\n6\n0\nSEQEND\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.process(file);
      expect(result.features.features).toHaveLength(1);
      
      const geometry = result.features.features[0].geometry;
      expect(isPolygon(geometry)).toBe(true);
      if (isPolygon(geometry)) {
        expect(geometry.coordinates[0]).toEqual([[1, 2], [3, 4], [5, 6], [1, 2]]);
      }
    });
  });

  describe('block reference handling', () => {
    test('should expand block references', async () => {
      const content = `0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nTEST\n0\nPOINT\n10\n1\n20\n2\n0\nENDBLK\n0\nENDSEC\n2\nENTITIES\n0\nINSERT\n2\nTEST\n10\n0\n20\n0\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.process(file);
      expect(result.features.features).toHaveLength(1);
      
      const geometry = result.features.features[0].geometry;
      expect(isPoint(geometry)).toBe(true);
      if (isPoint(geometry)) {
        expect(geometry.coordinates).toEqual([1, 2]);
      }
    });

    test('should handle missing block references', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nINSERT\n2\nMISSING\n10\n0\n20\n0\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.process(file);
      expect(result.statistics.errors).toHaveLength(1);
      expect(result.statistics.errors[0].type).toBe('missing_block');
    });
  });

  describe('layer handling', () => {
    test('should handle layer filtering', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n8\nLAYER1\n10\n1\n20\n2\n0\nPOINT\n8\nLAYER2\n10\n3\n20\n4\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      processor = new DxfProcessor({
        selectedLayers: ['LAYER1']
      });
      
      const result = await processor.process(file);
      expect(result.features.features).toHaveLength(1);
      
      const geometry = result.features.features[0].geometry;
      expect(isPoint(geometry)).toBe(true);
      if (isPoint(geometry)) {
        expect(geometry.coordinates).toEqual([1, 2]);
      }
    });

    test('should handle undefined layers', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n8\nUNDEFINED\n10\n1\n20\n2\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.process(file);
      expect(result.statistics.errors).toHaveLength(1);
      expect(result.statistics.errors[0].type).toBe('undefined_layer');
    });
  });

  describe('coordinate system handling', () => {
    test('should detect Swiss coordinates', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n10\n2600000\n20\n1200000\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.analyze(file);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });

    test('should use provided coordinate system', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n10\n1\n20\n2\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      processor = new DxfProcessor({
        coordinateSystem: COORDINATE_SYSTEMS.SWISS_LV95
      });
      
      const result = await processor.process(file);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });
  });

  describe('error handling', () => {
    test('should handle invalid coordinates', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n10\nNaN\n20\n2\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.process(file);
      expect(result.statistics.errors).toHaveLength(1);
      expect(result.statistics.errors[0].type).toBe('invalid_coordinates');
    });

    test('should handle invalid entity types', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nINVALID\n10\n1\n20\n2\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      const result = await processor.process(file);
      expect(result.statistics.errors).toHaveLength(1);
      expect(result.statistics.errors[0].type).toBe('unsupported_entity');
    });
  });

  describe('progress reporting', () => {
    test('should report progress during processing', async () => {
      const onProgress = jest.fn();
      processor = new DxfProcessor({ onProgress });

      const content = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n10\n1\n20\n2\n0\nENDSEC\n0\nEOF\n`;
      const file = new File([content], 'test.dxf');
      
      await processor.process(file);
      
      expect(onProgress).toHaveBeenCalled();
      const progressValues = onProgress.mock.calls.map(call => call[0]);
      expect(Math.min(...progressValues)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...progressValues)).toBeLessThanOrEqual(1);
    });
  });
});

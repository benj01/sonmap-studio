import { CsvProcessor } from '../../processors/csv-processor';
import { ProcessorOptions } from '../../processors/base-processor';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { ValidationError, ParseError } from '../../utils/errors';
import { Feature, Geometry, Position, Point } from 'geojson';

function isPoint(geometry: Geometry): geometry is Point {
  return geometry.type === 'Point';
}

function expectPointCoordinates(geometry: Geometry, expected: number[]): void {
  expect(isPoint(geometry)).toBe(true);
  if (isPoint(geometry)) {
    expect(geometry.coordinates).toEqual(expected);
  }
}

describe('CsvProcessor', () => {
  let processor: CsvProcessor;
  
  beforeEach(() => {
    processor = new CsvProcessor();
  });

  describe('file type detection', () => {
    test('should detect CSV files', async () => {
      expect(await processor.canProcess(new File([''], 'test.csv'))).toBe(true);
      expect(await processor.canProcess(new File([''], 'test.xyz'))).toBe(true);
      expect(await processor.canProcess(new File([''], 'test.txt'))).toBe(true);
      expect(await processor.canProcess(new File([''], 'test.shp'))).toBe(false);
    });
  });

  describe('column mapping', () => {
    test('should detect x,y columns', async () => {
      const content = 'x,y\n1,2\n3,4';
      const file = new File([content], 'test.csv');
      
      const result = await processor.analyze(file);
      expect(result.preview.features).toHaveLength(2);
      expectPointCoordinates(result.preview.features[0].geometry, [1, 2]);
    });

    test('should detect easting,northing columns', async () => {
      const content = 'easting,northing\n1,2\n3,4';
      const file = new File([content], 'test.csv');
      
      const result = await processor.analyze(file);
      expect(result.preview.features).toHaveLength(2);
      expectPointCoordinates(result.preview.features[0].geometry, [1, 2]);
    });

    test('should detect longitude,latitude columns', async () => {
      const content = 'longitude,latitude\n1,2\n3,4';
      const file = new File([content], 'test.csv');
      
      const result = await processor.analyze(file);
      expect(result.preview.features).toHaveLength(2);
      expectPointCoordinates(result.preview.features[0].geometry, [1, 2]);
    });

    test('should handle z coordinate', async () => {
      const content = 'x,y,z\n1,2,3\n4,5,6';
      const file = new File([content], 'test.csv');
      
      const result = await processor.analyze(file);
      expect(result.preview.features).toHaveLength(2);
      expectPointCoordinates(result.preview.features[0].geometry, [1, 2, 3]);
    });

    test('should throw error if no coordinate columns found', async () => {
      const content = 'a,b,c\n1,2,3';
      const file = new File([content], 'test.csv');
      
      await expect(processor.analyze(file)).rejects.toThrow(ValidationError);
    });
  });

  describe('coordinate validation', () => {
    test('should validate coordinate values', async () => {
      const content = 'x,y\n1,2\nNaN,4\n5,Infinity\n7,8';
      const file = new File([content], 'test.csv');
      
      const result = await processor.process(file);
      expect(result.features.features).toHaveLength(2); // Only valid coordinates
      expect(result.statistics.errors).toHaveLength(2); // Two invalid rows
    });

    test('should handle empty values', async () => {
      const content = 'x,y\n1,2\n,4\n5,\n7,8';
      const file = new File([content], 'test.csv');
      
      const result = await processor.process(file);
      expect(result.features.features).toHaveLength(2); // Only complete rows
      expect(result.statistics.errors).toHaveLength(2); // Two incomplete rows
    });
  });

  describe('error reporting', () => {
    test('should report delimiter detection errors', async () => {
      const content = 'x;y\n1;2';  // Semicolon delimiter
      const file = new File([content], 'test.csv');
      
      const result = await processor.analyze(file);
      const warnings = processor.getWarnings();
      expect(warnings.some(w => w.includes('delimiter'))).toBe(true);
    });

    test('should report coordinate parsing errors', async () => {
      const content = 'x,y\n1,abc\n2,3';
      const file = new File([content], 'test.csv');
      
      const result = await processor.process(file);
      expect(result.statistics.errors.some(e => 
        e.type === 'coordinate_parsing' && e.count === 1
      )).toBe(true);
    });

    test('should report empty file error', async () => {
      const file = new File([''], 'test.csv');
      await expect(processor.analyze(file)).rejects.toThrow(ValidationError);
    });
  });

  describe('progress reporting', () => {
    test('should report progress during processing', async () => {
      const onProgress = jest.fn();
      processor = new CsvProcessor({ onProgress });

      const content = Array(100).fill('1,2').join('\n');
      const file = new File([content], 'test.csv');
      
      await processor.process(file);
      
      expect(onProgress).toHaveBeenCalled();
      const progressValues = onProgress.mock.calls.map(call => call[0]);
      expect(Math.min(...progressValues)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...progressValues)).toBeLessThanOrEqual(1);
    });
  });

  describe('coordinate system handling', () => {
    test('should detect Swiss coordinates', async () => {
      const content = 'x,y\n2600000,1200000\n2600100,1200100';
      const file = new File([content], 'test.csv');
      
      const result = await processor.analyze(file);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });

    test('should detect WGS84 coordinates', async () => {
      const content = 'longitude,latitude\n7.123,46.456\n7.124,46.457';
      const file = new File([content], 'test.csv');
      
      const result = await processor.analyze(file);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.WGS84);
    });

    test('should use provided coordinate system', async () => {
      const content = 'x,y\n1,2\n3,4';
      const file = new File([content], 'test.csv');
      
      processor = new CsvProcessor({
        coordinateSystem: COORDINATE_SYSTEMS.SWISS_LV95
      });
      
      const result = await processor.process(file);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });
  });

  describe('statistics', () => {
    test('should count features and errors', async () => {
      const content = 'x,y\n1,2\nNaN,4\n5,6';
      const file = new File([content], 'test.csv');
      
      const result = await processor.process(file);
      expect(result.statistics.featureCount).toBe(2);
      expect(result.statistics.errors).toHaveLength(1);
      expect(result.statistics.featureTypes.Point).toBe(2);
    });

    test('should handle empty result', async () => {
      const content = 'x,y\nNaN,NaN\nInf,Inf';
      const file = new File([content], 'test.csv');
      
      await expect(processor.process(file)).rejects.toThrow(ValidationError);
    });
  });
});

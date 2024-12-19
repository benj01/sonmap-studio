import { DxfProcessor } from '../processors/dxf-processor';
import { createMockErrorReporter, createMockFile, createMockDxfData } from './test-utils';
import { ProcessorOptions } from '../processors/base-processor';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { ErrorReporter } from '../utils/errors';

describe('DxfProcessor', () => {
  let errorReporter: ErrorReporter;
  let processor: DxfProcessor;
  let options: ProcessorOptions;

  beforeEach(() => {
    errorReporter = createMockErrorReporter();
    options = {
      errorReporter,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84
    };
    processor = new DxfProcessor(options);
  });

  describe('canProcess', () => {
    it('should return true for .dxf files', async () => {
      const file = createMockFile('test.dxf', 'application/dxf', '');
      const result = await processor.canProcess(file);
      expect(result).toBe(true);
    });

    it('should return false for non-dxf files', async () => {
      const file = createMockFile('test.txt', 'text/plain', '');
      const result = await processor.canProcess(file);
      expect(result).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should report error for invalid DXF content', async () => {
      const file = createMockFile('test.dxf', 'application/dxf', 'invalid content');
      
      await expect(processor.analyze(file)).rejects.toThrow();
      
      const errors = (errorReporter as any).getReportsByType('PARSE_ERROR');
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('DXF parsing failed');
      expect(errors[0].context).toHaveProperty('contentPreview');
    });

    it('should report warning for missing layers', async () => {
      const mockDxf = createMockDxfData();
      jest.spyOn(processor['parser'], 'parse').mockResolvedValue(mockDxf);
      
      await processor.analyze(createMockFile('test.dxf', 'application/dxf', ''));
      
      const warnings = (errorReporter as any).getReportsByType('NO_COORDINATES');
      expect(warnings.length).toBe(1);
      expect(warnings[0].message).toBe('No coordinates found for detection');
    });

    it('should report error for critical analysis errors', async () => {
      const mockDxf = createMockDxfData();
      jest.spyOn(processor['parser'], 'parse').mockResolvedValue(mockDxf);
      jest.spyOn(processor['analyzer'], 'analyze').mockReturnValue({
        isValid: false,
        errors: [{ isCritical: true, message: 'Critical error', type: 'CRITICAL' }],
        warnings: [],
        stats: {
          entityCount: 0,
          layerCount: 0,
          blockCount: 0,
          lineCount: 0,
          pointCount: 0,
          polylineCount: 0,
          circleCount: 0,
          arcCount: 0,
          textCount: 0
        }
      });
      
      await expect(processor.analyze(createMockFile('test.dxf', 'application/dxf', '')))
        .rejects.toThrow('Critical errors found in DXF file');
      
      const errors = (errorReporter as any).getReportsByType('CRITICAL_ERROR');
      expect(errors.length).toBe(1);
      expect(errors[0].context).toHaveProperty('criticalErrors');
    });

    it('should report coordinate system detection results', async () => {
      const mockDxf = createMockDxfData();
      mockDxf.entities = [{
        type: 'POINT',
        layer: '0',
        position: { x: 2600000, y: 1200000 }
      }];
      jest.spyOn(processor['parser'], 'parse').mockResolvedValue(mockDxf);
      
      await processor.analyze(createMockFile('test.dxf', 'application/dxf', ''));
      
      const info = (errorReporter as any).getReportsByType('COORDINATE_SYSTEM');
      expect(info.length).toBeGreaterThan(0);
      expect(info[0].context).toHaveProperty('system');
    });
  });

  describe('process', () => {
    it('should report error for failed entity conversion', async () => {
      const mockDxf = createMockDxfData();
      mockDxf.entities = [{
        type: 'POINT',
        layer: '0',
        position: { x: NaN, y: NaN } // Invalid coordinates
      }];
      jest.spyOn(processor['parser'], 'parse').mockResolvedValue(mockDxf);
      
      await processor.process(createMockFile('test.dxf', 'application/dxf', ''));
      
      const errors = (errorReporter as any).getReportsByType('CONVERSION_ERROR');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].context).toHaveProperty('entityType', 'POINT');
    });

    it('should report transformation errors', async () => {
      const mockDxf = createMockDxfData();
      mockDxf.entities = [{
        type: 'POINT',
        layer: '0',
        position: { x: 2600000, y: 1200000 } // Swiss coordinates
      }];
      jest.spyOn(processor['parser'], 'parse').mockResolvedValue(mockDxf);
      
      options.coordinateSystem = COORDINATE_SYSTEMS.SWISS_LV95;
      await processor.process(createMockFile('test.dxf', 'application/dxf', ''));
      
      const errors = (errorReporter as any).getReportsByType('TRANSFORM_ERROR');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].context).toHaveProperty('error');
    });

    it('should track failed transformations in statistics', async () => {
      const mockDxf = createMockDxfData();
      mockDxf.entities = [
        { type: 'POINT', layer: '0', position: { x: NaN, y: NaN } },
        { type: 'POINT', layer: '0', position: { x: 0, y: 0 } }
      ];
      jest.spyOn(processor['parser'], 'parse').mockResolvedValue(mockDxf);
      
      const result = await processor.process(createMockFile('test.dxf', 'application/dxf', ''));
      
      expect(result.statistics.failedTransformations).toBeGreaterThan(0);
    });
  });
});

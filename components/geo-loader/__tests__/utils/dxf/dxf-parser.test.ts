import { DxfParser } from '../../../utils/dxf/parser';
import { createMockErrorReporter, createMockDxfData } from '../../test-utils';
import { ErrorReporter } from '../../../utils/errors';
import { DxfData, DxfEntity, DxfBlock, DxfInsertEntity } from '../../../utils/dxf/types';
import { MockErrorReporter } from '../../test-utils';

describe('DxfParser', () => {
  let errorReporter: MockErrorReporter;
  let parser: DxfParser;

  beforeEach(() => {
    errorReporter = createMockErrorReporter();
    parser = new DxfParser(errorReporter);
  });

  describe('parse', () => {
    it('should parse valid DXF content', async () => {
      // Create a minimal valid DXF content string
      const content = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n8\n0\n10\n0\n20\n0\n0\nENDSEC\n0\nEOF\n`;
      const result = await parser.parse(content);

      expect(result).toBeDefined();
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].type).toBe('POINT');
      expect(errorReporter.getReportCount()).toBe(0);
    });

    it('should report error for invalid DXF content', async () => {
      const content = 'invalid content';
      
      await expect(parser.parse(content)).rejects.toThrow('DXF parsing failed');
      
      const errors = errorReporter.getReportsByType('PARSE_ERROR');
      expect(errors.length).toBe(1);
      expect(errors[0].context).toHaveProperty('contentPreview', 'invalid content');
    });

    it('should handle empty DXF content', async () => {
      const content = '';
      
      await expect(parser.parse(content)).rejects.toThrow('Empty DXF content');
      
      const errors = errorReporter.getReportsByType('PARSE_ERROR');
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('Empty DXF content');
    });
  });

  describe('extractBlocks', () => {
    it('should extract blocks from DXF data', async () => {
      const mockBlock: DxfBlock = {
        name: 'TEST_BLOCK',
        layer: '0',
        position: { x: 0, y: 0, z: 0 },
        entities: [{
          type: 'POINT',
          layer: '0',
          position: { x: 0, y: 0, z: 0 }
        }]
      };

      const content = `0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nTEST_BLOCK\n8\n0\n10\n0\n20\n0\n30\n0\n0\nPOINT\n8\n0\n10\n0\n20\n0\n30\n0\n0\nENDBLK\n0\nENDSEC\n0\nEOF\n`;
      const result = await parser.parse(content);
      
      expect(result.blocks).toBeDefined();
      if (result.blocks) {
        expect(Object.keys(result.blocks)).toContain('TEST_BLOCK');
        expect(result.blocks['TEST_BLOCK'].entities).toHaveLength(1);
      }
    });

    it('should handle missing blocks section', async () => {
      const content = `0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n`;
      const result = await parser.parse(content);
      
      expect(result.blocks).toEqual({});
      expect(errorReporter.getWarnings()).toHaveLength(0);
    });
  });

  describe('expandBlockReferences', () => {
    it('should expand block references with transformations', async () => {
      const mockBlock: DxfBlock = {
        name: 'TEST_BLOCK',
        layer: '0',
        position: { x: 0, y: 0, z: 0 },
        entities: [{
          type: 'POINT',
          layer: '0',
          position: { x: 1, y: 1, z: 0 }
        }]
      };

      const mockInsert: DxfInsertEntity = {
        type: 'INSERT',
        layer: '0',
        block: 'TEST_BLOCK',
        position: { x: 2, y: 2, z: 0 },
        scale: { x: 2, y: 2, z: 1 },
        rotation: 45
      };

      const content = `0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nTEST_BLOCK\n8\n0\n10\n0\n20\n0\n30\n0\n0\nPOINT\n8\n0\n10\n1\n20\n1\n30\n0\n0\nENDBLK\n0\nENDSEC\n2\nENTITIES\n0\nINSERT\n8\n0\n2\nTEST_BLOCK\n10\n2\n20\n2\n30\n0\n41\n2\n42\n2\n43\n1\n50\n45\n0\nENDSEC\n0\nEOF\n`;
      const result = await parser.parse(content);
      
      const expandedEntities = parser.expandBlockReferences(result);
      expect(expandedEntities).toHaveLength(1);
      
      const transformedPoint = expandedEntities[0];
      expect(transformedPoint.type).toBe('POINT');
      if (transformedPoint.type === 'POINT') {
        expect(transformedPoint.position.x).toBeCloseTo(3.414, 3); // Calculated based on transformation
        expect(transformedPoint.position.y).toBeCloseTo(3.414, 3);
      }
    });

    it('should handle circular block references', async () => {
      const content = `0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nBLOCK1\n8\n0\n10\n0\n20\n0\n30\n0\n0\nINSERT\n8\n0\n2\nBLOCK2\n10\n0\n20\n0\n30\n0\n0\nENDBLK\n0\nBLOCK\n2\nBLOCK2\n8\n0\n10\n0\n20\n0\n30\n0\n0\nINSERT\n8\n0\n2\nBLOCK1\n10\n0\n20\n0\n30\n0\n0\nENDBLK\n0\nENDSEC\n0\nEOF\n`;
      const result = await parser.parse(content);
      
      const expandedEntities = parser.expandBlockReferences(result);
      
      const warnings = errorReporter.getReportsByType('CIRCULAR_REFERENCE');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].context).toHaveProperty('blockPath');
    });
  });

  describe('extractLayers', () => {
    it('should extract layers from DXF data', async () => {
      const content = `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nTEST_LAYER\n62\n1\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nEOF\n`;
      const result = await parser.parse(content);
      
      expect(result.tables?.layer?.layers).toBeDefined();
      if (result.tables?.layer?.layers) {
        expect(Object.keys(result.tables.layer.layers)).toContain('TEST_LAYER');
        expect(result.tables.layer.layers['TEST_LAYER']).toHaveProperty('color', 1);
        expect(result.tables.layer.layers['TEST_LAYER']).toHaveProperty('lineType', 'CONTINUOUS');
      }
    });

    it('should ensure default layer 0 exists', async () => {
      const content = `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nENDTAB\n0\nENDSEC\n0\nEOF\n`;
      const result = await parser.parse(content);
      
      expect(result.tables?.layer?.layers?.['0']).toBeDefined();
      if (result.tables?.layer?.layers?.['0']) {
        expect(result.tables.layer.layers['0']).toHaveProperty('name', '0');
      }
    });
  });
});

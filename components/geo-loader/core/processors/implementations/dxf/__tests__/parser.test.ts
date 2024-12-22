import { readFileSync } from 'fs';
import { DxfParser } from '../parser';
import { DxfParserWrapper } from '../parsers/dxf-parser-wrapper';
import path from 'path';

// Create a minimal mock that matches what our code actually uses
interface MockFile {
  name: string;
  text(): Promise<string>;
}

class TestFile implements MockFile {
  constructor(private content: string, public name: string) {}

  async text(): Promise<string> {
    return this.content;
  }
}

describe('DXF Parser Integration Tests', () => {
  let parser: DxfParser;

  beforeEach(() => {
    parser = new DxfParser();
  });

  describe('Basic Parsing', () => {
    it('should parse test DXF file successfully', async () => {
      // Read test file
      const filePath = path.resolve(__dirname, '../../../../../../../test-data/dxf/testlinie.dxf');
      console.log('[DEBUG] Reading file from:', filePath);
      console.log('[DEBUG] File exists:', require('fs').existsSync(filePath));
      
      const content = readFileSync(filePath, { encoding: 'utf8' });
      console.log('[DEBUG] File content length:', content.length);
      console.log('[DEBUG] File content preview:', content.substring(0, 200));
      
      // Create File object from content
      const file = new TestFile(content, 'testlinie.dxf') as unknown as File;

      // Analyze structure
      const result = await parser.analyzeStructure(file);

      // Basic structure checks
      expect(result).toBeDefined();
      expect(result.structure).toBeDefined();
      expect(result.preview).toBeDefined();
      
      // Log analysis results
      console.log('[DEBUG] DXF Analysis Result:', {
        layers: result.structure.layers.length,
        blocks: result.structure.blocks.length,
        entityTypes: result.structure.entityTypes,
        previewEntities: result.preview.length
      });

      // Convert to features
      const features = await parser.parseFeatures(file, {});
      
      // Log feature conversion results
      console.log('[DEBUG] Feature Conversion Result:', {
        featureCount: features.length,
        types: Array.from(new Set(features.map(f => f.geometry.type)))
      });

      // Feature checks
      expect(features).toBeDefined();
      expect(features.length).toBeGreaterThan(0);
      features.forEach(feature => {
        expect(feature.type).toBe('Feature');
        expect(feature.geometry).toBeDefined();
        expect(feature.properties).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid DXF content gracefully', async () => {
      const invalidContent = 'Not a DXF file';
      const file = new TestFile(invalidContent, 'invalid.dxf') as unknown as File;

      await expect(parser.analyzeStructure(file)).rejects.toThrow();
    });
  });
});

import { DxfParser } from '../../../utils/dxf/parser';
import { DxfConverter } from '../../../utils/dxf/converter';
import { createMockErrorReporter, createMockFile } from '../../test-utils';
import { MockErrorReporter } from '../../test-utils';
import { DxfData } from '../../../utils/dxf/types';

describe('DXF Integration Tests', () => {
  let errorReporter: MockErrorReporter;
  let parser: DxfParser;
  let converter: DxfConverter;

  beforeEach(() => {
    errorReporter = createMockErrorReporter();
    parser = new DxfParser(errorReporter);
    converter = new DxfConverter(errorReporter);
  });

  it('should successfully parse and convert a complete DXF file', async () => {
    // Create a minimal but complete DXF file content
    const content = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
0
70
0
62
7
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
POINT
8
0
10
1.0
20
2.0
30
0.0
0
LINE
8
0
10
0.0
20
0.0
30
0.0
11
1.0
21
1.0
31
0.0
0
CIRCLE
8
0
10
0.0
20
0.0
30
0.0
40
1.0
0
ENDSEC
0
EOF`;

    // Parse the DXF content
    const dxfData = await parser.parse(content);

    // Verify basic DXF structure
    expect(dxfData.entities).toBeDefined();
    expect(dxfData.entities.length).toBe(3); // POINT, LINE, CIRCLE
    expect(dxfData.tables).toBeDefined();
    expect(dxfData.tables?.layer).toBeDefined();
    expect(dxfData.tables?.layer?.layers).toBeDefined();
    expect(dxfData.tables?.layer?.layers?.['0']).toBeDefined();

    // Expand block references (if any)
    const expandedEntities = parser.expandBlockReferences(dxfData);
    expect(expandedEntities.length).toBe(3); // No blocks to expand

    // Convert each entity to GeoJSON
    const features = expandedEntities
      .map(entity => converter.entityToGeoFeature(entity))
      .filter(feature => feature !== null);

    expect(features.length).toBe(3);

    // Verify each converted feature
    const [point, line, circle] = features;

    // Check point
    expect(point?.geometry.type).toBe('Point');
    expect(point?.properties.type).toBe('POINT');
    expect(point?.properties.layer).toBe('0');

    // Check line
    expect(line?.geometry.type).toBe('LineString');
    expect(line?.properties.type).toBe('LINE');
    expect(line?.properties.layer).toBe('0');

    // Check circle
    expect(circle?.geometry.type).toBe('Polygon');
    expect(circle?.properties.type).toBe('CIRCLE');
    expect(circle?.properties.layer).toBe('0');

    // Verify no errors were reported
    expect(errorReporter.getReportCount()).toBe(0);
  });

  it('should handle and report errors throughout the pipeline', async () => {
    // Create a DXF content with various issues
    const content = `0
SECTION
2
ENTITIES
0
POINT
8
0
10
NaN
20
NaN
0
LINE
8
NONEXISTENT_LAYER
10
0
20
0
11
invalid
21
invalid
0
UNSUPPORTED
8
0
0
ENDSEC
0
EOF`;

    // Parse the DXF content
    const dxfData = await parser.parse(content);

    // Expand and convert entities
    const expandedEntities = parser.expandBlockReferences(dxfData);
    const features = expandedEntities
      .map(entity => converter.entityToGeoFeature(entity))
      .filter(feature => feature !== null);

    // Should have no valid features
    expect(features.length).toBe(0);

    // Check error reports
    const errors = errorReporter.getReports();
    
    // Should have multiple errors/warnings:
    // - Invalid coordinates in POINT
    // - Invalid coordinates in LINE
    // - Unsupported entity type
    expect(errors.length).toBeGreaterThanOrEqual(3);

    // Verify specific error types were reported
    const errorTypes = errors.map(e => e.type);
    expect(errorTypes).toContain('CONVERSION_ERROR');
    expect(errorTypes).toContain('UNSUPPORTED_ENTITY');
  });

  it('should handle circular block references', async () => {
    // Create a DXF content with circular block references
    const content = `0
SECTION
2
BLOCKS
0
BLOCK
2
BLOCK1
8
0
0
INSERT
8
0
2
BLOCK2
10
0
20
0
0
ENDBLK
0
BLOCK
2
BLOCK2
8
0
0
INSERT
8
0
2
BLOCK1
10
0
20
0
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
8
0
2
BLOCK1
10
0
20
0
0
ENDSEC
0
EOF`;

    // Parse and process
    const dxfData = await parser.parse(content);
    const expandedEntities = parser.expandBlockReferences(dxfData);

    // Should have reported circular reference warning
    const warnings = errorReporter.getReportsByType('CIRCULAR_REFERENCE');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].context).toHaveProperty('blockPath');
  });
});

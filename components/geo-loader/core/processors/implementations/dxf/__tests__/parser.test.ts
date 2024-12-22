import { parseEntities } from '../parsers/entity-parser';
import { findSection, parseGroupCodes } from '../utils/regex-patterns';

const TEST_DXF = `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1018
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  5
20000
100
AcDbEntity
  8
0
100
AcDbPolyline
 70
0
 90
2
 10
2643720.09032519
 20
1248971.43045559
 10
2646436.28533667
 20
1249000.12265641
  0
ENDSEC`;

describe('DXF Parser', () => {
  describe('findSection', () => {
    it('should find ENTITIES section with indented content', () => {
      const result = findSection(TEST_DXF, 'ENTITIES');
      expect(result).not.toBeNull();
      expect(result?.content).toContain('LWPOLYLINE');
      
      // Verify section content structure
      const lines = result?.content.split('\n');
      expect(lines?.some(line => line.trim() === '0')).toBe(true);
      expect(lines?.some(line => line.trim() === 'LWPOLYLINE')).toBe(true);
    });

    it('should find HEADER section with indented content', () => {
      const result = findSection(TEST_DXF, 'HEADER');
      expect(result).not.toBeNull();
      expect(result?.content).toContain('$ACADVER');
      
      // Verify section content structure
      const lines = result?.content.split('\n');
      expect(lines?.some(line => line.trim() === '9')).toBe(true);
      expect(lines?.some(line => line.trim() === '$ACADVER')).toBe(true);
    });
  });

  describe('parseGroupCodes', () => {
    it('should parse group codes from indented content', () => {
      const content = `  5
20000
100
AcDbEntity
  8
0`;
      const codes = parseGroupCodes(content);
      expect(codes).toEqual([
        [5, '20000'],
        [100, 'AcDbEntity'],
        [8, '0']
      ]);
    });

    it('should handle empty lines between group codes', () => {
      const content = `  5
20000

100
AcDbEntity

  8
0`;
      const codes = parseGroupCodes(content);
      expect(codes).toEqual([
        [5, '20000'],
        [100, 'AcDbEntity'],
        [8, '0']
      ]);
    });

    it('should preserve zero values', () => {
      const content = `10
0
20
0
30
0`;
      const codes = parseGroupCodes(content);
      expect(codes).toEqual([
        [10, '0'],
        [20, '0'],
        [30, '0']
      ]);
    });
  });

  describe('parseEntities', () => {
    it('should parse LWPOLYLINE entity with coordinates', async () => {
      const result = await parseEntities(TEST_DXF);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'LWPOLYLINE',
        data: {
          vertices: [
            { x: 2643720.09032519, y: 1248971.43045559 },
            { x: 2646436.28533667, y: 1249000.12265641 }
          ]
        }
      });

      // Verify vertex coordinates are preserved exactly
      const vertices = result[0].data.vertices;
      expect(vertices).toBeDefined();
      expect(Array.isArray(vertices)).toBe(true);
      expect(vertices).toHaveLength(2);
      
      const [v1, v2] = vertices as Array<{ x: number; y: number }>;
      expect(v1.x).toBe(2643720.09032519);
      expect(v1.y).toBe(1248971.43045559);
      expect(v2.x).toBe(2646436.28533667);
      expect(v2.y).toBe(1249000.12265641);
    });

    it('should include entity attributes', async () => {
      const result = await parseEntities(TEST_DXF);
      expect(result[0].attributes).toMatchObject({
        layer: '0'
      });
    });

    it('should handle coordinate pairs in any order', async () => {
      const content = `  0
LWPOLYLINE
  5
20000
100
AcDbEntity
  8
0
100
AcDbPolyline
 70
0
 90
2
 20
1248971.43045559
 10
2643720.09032519
 20
1249000.12265641
 10
2646436.28533667`;
      
      const result = await parseEntities(content);
      expect(result).toHaveLength(1);
      const vertices = result[0].data.vertices;
      expect(vertices).toBeDefined();
      expect(vertices).toHaveLength(2);
      expect(vertices?.[0]).toMatchObject({
        x: 2643720.09032519,
        y: 1248971.43045559
      });
    });
  });
});

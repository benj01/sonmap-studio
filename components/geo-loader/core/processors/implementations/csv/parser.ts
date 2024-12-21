import { Feature, Point } from 'geojson';
import { CsvColumn, CsvParseOptions, CsvStructure, CsvAnalyzeResult } from './types';
import { ValidationError } from '../../../errors/types';

/**
 * Handles CSV file parsing
 */
export class CsvParser {
  /**
   * Analyze CSV file structure
   */
  async analyzeStructure(
    file: File,
    options: {
      previewRows?: number;
      detectTypes?: boolean;
      hasHeaders?: boolean;
      delimiter?: string;
      quote?: string;
    } = {}
  ): Promise<CsvAnalyzeResult> {
    const text = await file.text();
    const lines = text.split('\n').slice(0, options.previewRows || 10);
    
    // Detect delimiter if not provided
    const delimiter = options.delimiter || this.detectDelimiter(lines);
    
    // Parse preview rows
    const preview = lines.map(line => this.parseLine(line, delimiter, options.quote || '"'));
    
    // Detect structure
    const structure: CsvStructure = {
      columns: this.detectColumns(preview, {
        hasHeaders: options.hasHeaders ?? true,
        detectTypes: options.detectTypes ?? true
      }),
      hasHeaders: options.hasHeaders ?? true,
      delimiter,
      quote: options.quote || '"'
    };

    // Identify coordinate and attribute columns
    const coordinateColumns = structure.columns.filter(col => col.isCoordinate);
    const attributeColumns = structure.columns.filter(col => col.isAttribute);

    // Check for issues
    const issues = this.validateStructure(structure);

    return {
      structure,
      preview,
      coordinateColumns,
      attributeColumns,
      issues
    };
  }

  /**
   * Parse CSV data into features
   */
  async parseFeatures(
    file: File,
    options: CsvParseOptions
  ): Promise<Feature[]> {
    const text = await file.text();
    const lines = text.split('\n');
    const startRow = (options.hasHeaders ? 1 : 0) + (options.skipRows || 0);
    const features: Feature[] = [];

    for (let i = startRow; i < lines.length; i++) {
      if (options.maxRows && i >= startRow + options.maxRows) {
        break;
      }

      const line = lines[i].trim();
      if (!line || (options.comment && line.startsWith(options.comment))) {
        continue;
      }

      try {
        const feature = this.parseFeature(line, options);
        if (feature) {
          features.push(feature);
        }
      } catch (error) {
        if (options.validate) {
          throw error;
        }
        // Skip invalid rows when validation is disabled
        continue;
      }
    }

    return features;
  }

  /**
   * Parse a single line into a feature
   */
  private parseFeature(
    line: string,
    options: CsvParseOptions
  ): Feature | null {
    const values = this.parseLine(line, options.delimiter, options.quote);
    
    // Find coordinate columns
    const xCol = options.columns.find(col => col.coordinateType === 'x');
    const yCol = options.columns.find(col => col.coordinateType === 'y');
    const zCol = options.columns.find(col => col.coordinateType === 'z');

    if (!xCol || !yCol) {
      throw new ValidationError(
        'Missing coordinate columns',
        'INVALID_COORDINATES',
        undefined,
        { line }
      );
    }

    // Parse coordinates
    const x = this.parseNumber(values[xCol.index], xCol.name);
    const y = this.parseNumber(values[yCol.index], yCol.name);
    const coordinates: number[] = zCol 
      ? [x, y, this.parseNumber(values[zCol.index], zCol.name)]
      : [x, y];

    // Create feature
    const feature: Feature<Point> = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates
      },
      properties: {}
    };

    // Add properties from attribute columns
    options.columns
      .filter(col => col.isAttribute)
      .forEach(col => {
        feature.properties![col.name] = this.parseValue(values[col.index], col);
      });

    return feature;
  }

  /**
   * Parse a line into values
   */
  private parseLine(
    line: string,
    delimiter: string,
    quote: string
  ): string[] {
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === quote) {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    values.push(currentValue.trim());
    return values;
  }

  /**
   * Detect delimiter from sample lines
   */
  private detectDelimiter(lines: string[]): string {
    const commonDelimiters = [',', ';', '\t', '|'];
    const counts = new Map<string, number>();

    for (const delimiter of commonDelimiters) {
      const count = lines.reduce((sum, line) => {
        return sum + (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
      }, 0);
      counts.set(delimiter, count);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * Detect columns from preview data
   */
  private detectColumns(
    preview: string[][],
    options: {
      hasHeaders: boolean;
      detectTypes: boolean;
    }
  ): CsvColumn[] {
    const firstRow = preview[0] || [];
    const dataRow = options.hasHeaders ? (preview[1] || []) : firstRow;

    return firstRow.map((value, index) => {
      const name = options.hasHeaders ? value : `Column ${index + 1}`;
      const type = options.detectTypes
        ? this.detectColumnType(preview.slice(options.hasHeaders ? 1 : 0).map(row => row[index]))
        : 'string';

      const column: CsvColumn = {
        name,
        index,
        type
      };

      // Try to detect coordinate columns
      if (type === 'number') {
        if (/^(x|lon|longitude)$/i.test(name)) {
          column.isCoordinate = true;
          column.coordinateType = 'x';
        } else if (/^(y|lat|latitude)$/i.test(name)) {
          column.isCoordinate = true;
          column.coordinateType = 'y';
        } else if (/^(z|elevation|height)$/i.test(name)) {
          column.isCoordinate = true;
          column.coordinateType = 'z';
        }
      }

      // Non-coordinate columns are treated as attributes
      if (!column.isCoordinate) {
        column.isAttribute = true;
      }

      return column;
    });
  }

  /**
   * Detect column type from sample values
   */
  private detectColumnType(values: string[]): CsvColumn['type'] {
    const nonEmptyValues = values.filter(v => v.trim());
    if (nonEmptyValues.length === 0) return 'string';

    const allNumbers = nonEmptyValues.every(v => !isNaN(Number(v)));
    if (allNumbers) return 'number';

    const allBooleans = nonEmptyValues.every(v => 
      ['true', 'false', '1', '0', 'yes', 'no'].includes(v.toLowerCase())
    );
    if (allBooleans) return 'boolean';

    const allDates = nonEmptyValues.every(v => !isNaN(Date.parse(v)));
    if (allDates) return 'date';

    return 'string';
  }

  /**
   * Parse value according to column type
   */
  private parseValue(value: string, column: CsvColumn): any {
    if (!value.trim()) return null;

    switch (column.type) {
      case 'number':
        return this.parseNumber(value, column.name);
      case 'boolean':
        return ['true', '1', 'yes'].includes(value.toLowerCase());
      case 'date':
        return new Date(value).toISOString();
      default:
        return value;
    }
  }

  /**
   * Parse number with validation
   */
  private parseNumber(value: string, columnName: string): number {
    const num = Number(value);
    if (isNaN(num)) {
      throw new ValidationError(
        `Invalid number in column ${columnName}: ${value}`,
        'INVALID_NUMBER',
        columnName,
        { value }
      );
    }
    return num;
  }

  /**
   * Validate CSV structure
   */
  private validateStructure(structure: CsvStructure): Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }> {
    const issues: Array<{
      type: string;
      message: string;
      details?: Record<string, unknown>;
    }> = [];

    // Check for coordinate columns
    const hasX = structure.columns.some(col => col.coordinateType === 'x');
    const hasY = structure.columns.some(col => col.coordinateType === 'y');

    if (!hasX || !hasY) {
      issues.push({
        type: 'MISSING_COORDINATES',
        message: 'Could not identify X/Y coordinate columns',
        details: {
          columns: structure.columns.map(c => c.name)
        }
      });
    }

    // Check for duplicate column names
    const names = structure.columns.map(c => c.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    
    if (duplicates.length > 0) {
      issues.push({
        type: 'DUPLICATE_COLUMNS',
        message: 'Found duplicate column names',
        details: { duplicates }
      });
    }

    return issues;
  }
}

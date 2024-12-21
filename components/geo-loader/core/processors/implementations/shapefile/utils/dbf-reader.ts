import { DbfHeader, ShapefileField } from '../types';

/**
 * Handles reading and parsing of DBF (dBase) files
 */
export class DbfReader {
  /**
   * Read and parse DBF header
   */
  async readHeader(buffer: ArrayBuffer): Promise<DbfHeader> {
    const view = new DataView(buffer);
    
    return {
      version: view.getUint8(0),
      lastUpdate: new Date(
        1900 + view.getUint8(1),
        view.getUint8(2) - 1,
        view.getUint8(3)
      ),
      recordCount: view.getInt32(4, true),
      headerLength: view.getInt16(8, true),
      recordLength: view.getInt16(10, true),
      fields: this.readFields(view)
    };
  }

  /**
   * Read field descriptors from DBF header
   */
  private readFields(view: DataView): ShapefileField[] {
    const fields: ShapefileField[] = [];
    let offset = 32; // Start of field descriptors
    
    while (offset < view.byteLength) {
      // Check for header terminator
      if (view.getUint8(offset) === 0x0D) break;
      
      // Read field name (11 bytes)
      const nameBytes = new Uint8Array(view.buffer, offset, 11);
      const name = new TextDecoder()
        .decode(nameBytes)
        .split('\0')[0]
        .trim();
      
      // Read field type (1 byte)
      const typeChar = String.fromCharCode(view.getUint8(offset + 11));
      
      // Map DBF type to our type enum
      const type = this.mapFieldType(typeChar);
      
      // Read field length and decimal count
      const length = view.getUint8(offset + 16);
      const decimals = view.getUint8(offset + 17);
      
      fields.push({
        name,
        type,
        length,
        decimals: type === 'N' || type === 'F' ? decimals : undefined
      });
      
      offset += 32; // Move to next field descriptor
    }
    
    return fields;
  }

  /**
   * Map DBF field type character to our type enum
   */
  private mapFieldType(type: string): ShapefileField['type'] {
    switch (type) {
      case 'C': return 'C'; // Character
      case 'N': return 'N'; // Numeric
      case 'F': return 'F'; // Float
      case 'L': return 'L'; // Logical
      case 'D': return 'D'; // Date
      default:
        console.warn(`Unknown DBF field type: ${type}, defaulting to Character`);
        return 'C';
    }
  }

  /**
   * Read all records from DBF file
   */
  async readRecords(
    buffer: ArrayBuffer,
    header: DbfHeader
  ): Promise<Record<number, Record<string, unknown>>> {
    const view = new DataView(buffer);
    const records: Record<number, Record<string, unknown>> = {};
    let offset = header.headerLength;
    
    for (let i = 0; i < header.recordCount; i++) {
      const record: Record<string, unknown> = {};
      let fieldOffset = offset + 1; // Skip record deleted flag
      
      for (const field of header.fields) {
        const valueBytes = new Uint8Array(buffer, fieldOffset, field.length);
        const value = new TextDecoder().decode(valueBytes).trim();
        
        record[field.name] = this.convertValue(value, field.type);
        fieldOffset += field.length;
      }
      
      records[i + 1] = record;
      offset = fieldOffset;
    }
    
    return records;
  }

  /**
   * Convert DBF field value to appropriate JavaScript type
   */
  private convertValue(value: string, type: ShapefileField['type']): unknown {
    if (value === '') return null;
    
    switch (type) {
      case 'N': // Numeric
      case 'F': // Float
        return value === '' ? null : Number(value);
        
      case 'L': // Logical
        return value.toLowerCase() === 't' || value.toLowerCase() === 'y';
        
      case 'D': // Date
        if (value.length === 8) {
          return new Date(
            parseInt(value.slice(0, 4)), // Year
            parseInt(value.slice(4, 6)) - 1, // Month (0-based)
            parseInt(value.slice(6, 8)) // Day
          );
        }
        return null;
        
      case 'C': // Character
      default:
        return value;
    }
  }
}

// Export singleton instance
export const dbfReader = new DbfReader();

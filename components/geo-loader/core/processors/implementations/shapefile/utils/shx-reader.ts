/**
 * Handles reading and parsing of SHX (shape index) files
 */
export class ShxReader {
  /**
   * Read record offsets from SHX file
   * @returns Array of [offset, length] tuples for each record
   */
  async readOffsets(buffer: ArrayBuffer): Promise<Array<[number, number]>> {
    const view = new DataView(buffer);
    const offsets: Array<[number, number]> = [];
    
    // Skip 100-byte header
    let offset = 100;
    
    // Each record is 8 bytes (4 bytes offset + 4 bytes length)
    while (offset < buffer.byteLength) {
      const recordOffset = view.getInt32(offset, false) * 2;
      const contentLength = view.getInt32(offset + 4, false) * 2;
      
      offsets.push([recordOffset, contentLength]);
      offset += 8;
    }
    
    return offsets;
  }

  /**
   * Read header information from SHX file
   * Returns file length in 16-bit words
   */
  async readHeader(buffer: ArrayBuffer): Promise<number> {
    const view = new DataView(buffer);
    
    // Validate file code
    const fileCode = view.getInt32(0, false);
    if (fileCode !== 9994) {
      throw new Error('Invalid SHX file: incorrect file code');
    }
    
    // File length in 16-bit words
    return view.getInt32(24, false);
  }

  /**
   * Get total number of records from SHX file
   */
  async getRecordCount(buffer: ArrayBuffer): Promise<number> {
    // File length minus header (100 bytes), divided by record size (8 bytes)
    return Math.floor((buffer.byteLength - 100) / 8);
  }

  /**
   * Get offset and length for a specific record
   * @param index 0-based record index
   */
  async getRecordLocation(
    buffer: ArrayBuffer,
    index: number
  ): Promise<[number, number]> {
    const view = new DataView(buffer);
    const offset = 100 + index * 8;
    
    if (offset >= buffer.byteLength) {
      throw new Error(`Record index ${index} out of bounds`);
    }
    
    const recordOffset = view.getInt32(offset, false) * 2;
    const contentLength = view.getInt32(offset + 4, false) * 2;
    
    return [recordOffset, contentLength];
  }
}

// Export singleton instance
export const shxReader = new ShxReader();

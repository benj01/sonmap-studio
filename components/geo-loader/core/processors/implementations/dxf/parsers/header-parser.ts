import { parseGroupCodes, findSection } from '../utils/regex-patterns';

export interface DxfHeader {
  $EXTMIN?: { x: number; y: number; z?: number };
  $EXTMAX?: { x: number; y: number; z?: number };
  $MEASUREMENT?: number;
}

/**
 * Parse DXF header section
 */
export function parseHeader(text: string): DxfHeader {
  const header: DxfHeader = {};

  // Find HEADER section
  const headerSection = findSection(text, 'HEADER');
  
  if (headerSection) {
    // Parse $EXTMIN
    const extminMatch = headerSection.content.match(/\$EXTMIN([\s\S]*?)(?=\$|\Z)/);
    if (extminMatch) {
      const groupCodes = parseGroupCodes(extminMatch[1]);
      const extmin: { x?: number; y?: number; z?: number } = {};
      
      groupCodes.forEach(([code, value]) => {
        switch (code) {
          case 10:
            extmin.x = parseFloat(value);
            break;
          case 20:
            extmin.y = parseFloat(value);
            break;
          case 30:
            extmin.z = parseFloat(value);
            break;
        }
      });
      
      if (typeof extmin.x === 'number' && typeof extmin.y === 'number') {
        header.$EXTMIN = extmin as { x: number; y: number; z?: number };
      }
    }

    // Parse $EXTMAX
    const extmaxMatch = headerSection.content.match(/\$EXTMAX([\s\S]*?)(?=\$|\Z)/);
    if (extmaxMatch) {
      const groupCodes = parseGroupCodes(extmaxMatch[1]);
      const extmax: { x?: number; y?: number; z?: number } = {};
      
      groupCodes.forEach(([code, value]) => {
        switch (code) {
          case 10:
            extmax.x = parseFloat(value);
            break;
          case 20:
            extmax.y = parseFloat(value);
            break;
          case 30:
            extmax.z = parseFloat(value);
            break;
        }
      });
      
      if (typeof extmax.x === 'number' && typeof extmax.y === 'number') {
        header.$EXTMAX = extmax as { x: number; y: number; z?: number };
      }
    }

    // Parse $MEASUREMENT
    const measurementMatch = headerSection.content.match(/\$MEASUREMENT[\s\r\n]+70[\s\r\n]+(\d+)/);
    if (measurementMatch) {
      header.$MEASUREMENT = parseInt(measurementMatch[1]);
    }
  }

  return header;
}

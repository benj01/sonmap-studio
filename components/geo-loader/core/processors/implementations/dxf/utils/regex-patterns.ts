/**
 * Clean up DXF content by normalizing line endings and removing comments
 */
export function cleanupContent(content: string): string {
  // Normalize line endings to \n
  let cleaned = content.replace(/\r\n|\r/g, '\n');
  
  // Remove comments
  cleaned = cleaned.replace(/\n\s*999[^\n]*/g, '');
  
  // Preserve group codes by ensuring they're on their own line
  cleaned = cleaned.replace(/^\s*(\d+)\s*\n\s*([^\n]+)/gm, '$1\n$2');
  
  // Log cleaned content for debugging
  console.log('[DEBUG] Cleaned content length:', cleaned.length);
  console.log('[DEBUG] Cleaned content preview:', cleaned.substring(0, 200));
  console.log('[DEBUG] First few group codes:', cleaned.split('\n').slice(0, 10).join('\n'));
  
  return cleaned;
}

/**
 * Find section in DXF content
 */
export function findSection(content: string, name: string): { content: string } | null {
  // Look for section start
  const sectionPattern = new RegExp(`\\s*0\\s*\\nSECTION\\s*\\n\\s*2\\s*\\n${name}\\s*\\n([\\s\\S]*?)\\s*0\\s*\\nENDSEC`, 'i');
  const match = content.match(sectionPattern);
  
  if (!match) {
    console.log(`[DEBUG] Section ${name} not found`);
    return null;
  }
  
  console.log(`[DEBUG] Found section ${name}, length:`, match[1].length);
  return {
    content: match[1]
  };
}

/**
 * Parse group codes and values
 */
export function parseGroupCodes(content: string): Array<[number, string]> {
  const lines = content.split('\n');
  const codes: Array<[number, string]> = [];
  
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim());
    const value = lines[i + 1].trim();
    if (!isNaN(code)) {
      codes.push([code, value]);
    }
  }
  
  console.log('[DEBUG] Parsed group codes:', codes.slice(0, 5));
  return codes;
}

/**
 * Pattern for matching entities
 */
export const ENTITY_PATTERN = /\s*0\s*\n([A-Z]+)\s*\n([\s\S]*?)(?=\s*0\s*\n(?:[A-Z]+|ENDSEC)\s*\n|$)/g;

/**
 * Pattern for matching blocks
 */
export const BLOCK_PATTERN = /\s*0\s*\nBLOCK\s*\n([\s\S]*?)(?=\s*0\s*\nENDBLK\s*\n)/g;

/**
 * Pattern for matching layers
 */
export const LAYER_PATTERN = /\s*0\s*\nLAYER\s*\n([\s\S]*?)(?=\s*0\s*\n(?:LAYER|ENDTAB)\s*\n|$)/g;

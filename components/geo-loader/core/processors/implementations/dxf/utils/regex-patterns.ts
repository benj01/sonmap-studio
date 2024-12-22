/**
 * Centralized regex patterns for DXF parsing
 */

/**
 * Pattern to match section start/end
 * - Matches group code 0 followed by SECTION
 * - Then matches group code 2 and section name in any order
 * - Captures section name and content
 * - Handles any whitespace and line ending style
 * - Ends at next section or ENDSEC
 */
export const SECTION_PATTERN = /[\s\r\n]*0[\s\r\n]+SECTION(?:[\s\S]*?2[\s\r\n]+(\w+)|2[\s\r\n]+(\w+)[\s\S]*?)[\s\r\n]+([\s\S]*?)(?=[\s\r\n]*0[\s\r\n]+(?:ENDSEC|SECTION))/gm;

/**
 * Pattern to match entities within ENTITIES section
 * - Matches group code 0 followed by entity type
 * - More flexible with whitespace and line endings
 * - Better handling of entity content boundaries
 * - Improved handling of coordinate pairs
 */
export const ENTITY_PATTERN = /[\s\r\n]*0[\s\r\n]+([^\s\r\n]+)[\s\r\n]+((?:(?![\s\r\n]*0[\s\r\n]+(?:[^\s\r\n]+|ENDSEC|SECTION))[\s\S])*)/gm;

/**
 * Pattern to match blocks within BLOCKS section
 * - Matches group code 0 followed by BLOCK
 * - More flexible with whitespace and line endings
 * - Better handling of block content boundaries
 * - Improved block end detection
 */
export const BLOCK_PATTERN = /[\s\r\n]*0[\s\r\n]+BLOCK[\s\r\n]+([\s\S]*?)[\s\r\n]*0[\s\r\n]+ENDBLK/gm;

/**
 * Pattern to match layers within LAYER table
 * - Matches group code 0 followed by LAYER
 * - More flexible with whitespace and line endings
 * - Better handling of layer content boundaries
 * - Improved layer/table end detection
 */
export const LAYER_PATTERN = /[\s\r\n]*0[\s\r\n]+LAYER[\s\r\n]+([\s\S]*?)(?=[\s\r\n]*0[\s\r\n]+(?:LAYER|ENDTAB)|\Z)/gm;

/**
 * Pattern to match group codes and values
 * - Matches any group code number
 * - Handles any whitespace and line ending style
 * - Better handling of value boundaries
 * - Preserves zero values and whitespace in values
 */
export const GROUP_CODE_PATTERN = /[\s\r\n]*(\d+)[\s\r\n]+([^\r\n]+?)[\s\r\n]*(?=[\s\r\n]*\d+[\s\r\n]+|$)/gm;

/**
 * Pattern to clean up content
 * - Optionally removes comments (not standard DXF)
 * - Normalizes line endings
 * - Removes empty lines
 */
export const CLEANUP_PATTERNS = {
  comments: /#.*$/gm,
  lineEndings: /\r\n?/g,
  emptyLines: /^\s*[\r\n]/gm,
  extraWhitespace: /\s+/g
};

/**
 * Helper to clean up DXF content
 * @param content The DXF content to clean
 * @param options Cleanup options
 * @returns Cleaned content
 */
export function cleanupContent(content: string, options: { removeComments?: boolean } = {}): string {
  let cleaned = content;
  
  // Only remove comments if explicitly requested since it's not standard DXF
  if (options.removeComments) {
    cleaned = cleaned.replace(CLEANUP_PATTERNS.comments, '');
  }
  
  return cleaned
    .replace(CLEANUP_PATTERNS.lineEndings, '\n') // Normalize line endings
    .replace(CLEANUP_PATTERNS.emptyLines, '') // Remove empty lines
    .replace(CLEANUP_PATTERNS.extraWhitespace, ' ') // Normalize whitespace
    .trim();
}

/**
 * Helper to parse group codes from content using line-based approach
 * @throws Error if content is malformed
 */
export function parseGroupCodes(content: string): Array<[number, string]> {
  // Split content into lines, preserving empty lines for structure
  const lines = content.split(/\r\n|\r|\n/);
  const groupCodes: Array<[number, string]> = [];
  const errors: string[] = [];

  // Process lines in pairs (group code + value)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Parse group code
    const code = parseInt(line);
    if (isNaN(code)) {
      errors.push(`Invalid group code at line ${i + 1}: "${line}"`);
      continue;
    }
    
    // Get value from next line
    i++;
    if (i >= lines.length) {
      errors.push(`Missing value for group code ${code} at line ${i}`);
      break;
    }
    
    const value = lines[i].trim();
    if (!value) {
      errors.push(`Empty value for group code ${code} at line ${i + 1}`);
      continue;
    }
    
    groupCodes.push([code, value]);
  }

  // Handle errors
  if (errors.length > 0) {
    if (groupCodes.length === 0) {
      throw new Error(`Malformed DXF: ${errors[0]}`);
    } else {
      console.warn('DXF parsing warnings:', errors);
    }
  }

  return groupCodes;
}

/**
 * Helper to find a specific section in DXF content
 * @param content The DXF file content
 * @param sectionName The name of the section to find (e.g., 'ENTITIES', 'BLOCKS')
 * @returns The section content if found, null otherwise
 */
export function findSection(content: string, sectionName: string): { content: string; match: RegExpExecArray } | null {
  // Reset lastIndex to ensure we start from the beginning
  SECTION_PATTERN.lastIndex = 0;
  
  // Normalize line endings and clean up content
  const normalizedContent = content
    .replace(/\r\n?/g, '\n')  // Convert all line endings to \n
    .replace(/\n\s*\n/g, '\n')  // Remove empty lines
    .trim();
  
  console.log(`[DEBUG] Looking for section: ${sectionName}`);
  console.log(`[DEBUG] Content sample (after normalization):`, normalizedContent.substring(0, 200));
  
  // Log the actual group codes and values at the start
  const firstLines = normalizedContent.split('\n').slice(0, 6);
  console.log('[DEBUG] First few lines:', firstLines);
  
  let match;
  let matchCount = 0;
  while ((match = SECTION_PATTERN.exec(normalizedContent)) !== null) {
    matchCount++;
    // Section name could be in either capture group depending on order
    const name = match[1] || match[2];
    const content = match[3];
    
    console.log(`[DEBUG] Found section #${matchCount}:`, {
      name,
      contentStart: content.substring(0, 100).split('\n').join(' | ')  // Make line breaks visible
    });
    
    if (name === sectionName) {
      console.log(`[DEBUG] Found requested section: ${sectionName}`);
      console.log('[DEBUG] Section content start:', content.substring(0, 200).split('\n').join(' | '));
      return {
        content,
        match
      };
    }
  }
  
  console.log(`[DEBUG] No matching section found. Total sections found: ${matchCount}`);
  // If no match found, let's see what the pattern is actually matching
  SECTION_PATTERN.lastIndex = 0;
  const allMatches = normalizedContent.match(SECTION_PATTERN);
  console.log('[DEBUG] All regex matches:', allMatches ? allMatches.length : 0);
  
  return null;
}

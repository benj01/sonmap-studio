import { DxfBlock } from '../types';
import { parseGroupCodes, findSection, BLOCK_PATTERN } from '../utils/regex-patterns';

/**
 * Parse DXF blocks from BLOCKS section
 */
export function parseBlocks(text: string): DxfBlock[] {
  const blocks: DxfBlock[] = [];
  const blocksSection = findSection(text, 'BLOCKS');
  
  if (blocksSection) {
    const blockRegex = BLOCK_PATTERN;
    let match;
    
    while ((match = blockRegex.exec(blocksSection.content)) !== null) {
      try {
        const groupCodes = parseGroupCodes(match[1]);
        const block: DxfBlock = {
          name: '',
          basePoint: [0, 0, 0],
          entities: []
        };
        
        groupCodes.forEach(([code, value]) => {
          switch (code) {
            case 2: // Block name
              block.name = value;
              break;
            case 10: // Base point X
              block.basePoint[0] = parseFloat(value);
              break;
            case 20: // Base point Y
              block.basePoint[1] = parseFloat(value);
              break;
            case 30: // Base point Z
              block.basePoint[2] = parseFloat(value);
              break;
            case 8: // Layer
              block.layer = value;
              break;
            case 4: // Description
              block.description = value;
              break;
          }
        });
        
        // Only add block if it has a valid name
        if (validateBlock(block)) {
          blocks.push(block);
        }
      } catch (error) {
        console.warn('Failed to parse block:', error);
      }
    }
  }
  
  return blocks;
}

/**
 * Validate block properties
 */
export function validateBlock(block: DxfBlock): boolean {
  // Block must have a name
  if (!block.name) {
    return false;
  }

  // Base point must be a valid coordinate array
  if (!Array.isArray(block.basePoint) || 
      block.basePoint.length !== 3 ||
      block.basePoint.some(coord => typeof coord !== 'number' || isNaN(coord))) {
    return false;
  }

  // Layer name must be a string if defined
  if (block.layer !== undefined && typeof block.layer !== 'string') {
    return false;
  }

  // Description must be a string if defined
  if (block.description !== undefined && typeof block.description !== 'string') {
    return false;
  }

  // Entities must be an array if defined
  if (block.entities !== undefined && !Array.isArray(block.entities)) {
    return false;
  }

  return true;
}

/**
 * Get block by name
 */
export function findBlockByName(blocks: DxfBlock[], name: string): DxfBlock | undefined {
  return blocks.find(block => block.name === name);
}

/**
 * Check if block name exists
 */
export function hasBlock(blocks: DxfBlock[], name: string): boolean {
  return blocks.some(block => block.name === name);
}

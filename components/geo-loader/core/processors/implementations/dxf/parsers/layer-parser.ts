import { DxfLayer } from '../types';
import { parseGroupCodes, findSection, LAYER_PATTERN } from '../utils/regex-patterns';

/**
 * Parse DXF layers from TABLES section
 */
export function parseLayers(text: string): DxfLayer[] {
  const layers: DxfLayer[] = [];
  
  // Find TABLES section
  const tablesSection = findSection(text, 'TABLES');
  
  if (tablesSection) {
    // Find LAYER table
    const layerTableMatch = tablesSection.content.match(
      /0[\s\r\n]+TABLE[\s\r\n]+2[\s\r\n]+LAYER([\s\S]*?)0[\s\r\n]+ENDTAB/m
    );
    
    if (layerTableMatch) {
      // Match individual layers
      const layerRegex = LAYER_PATTERN;
      let match;
      
      while ((match = layerRegex.exec(layerTableMatch[1])) !== null) {
        const groupCodes = parseGroupCodes(match[1]);
        const layer: DxfLayer = {
          name: '0' // Default layer name
        };
        
        // Parse layer properties
        groupCodes.forEach(([code, value]) => {
          switch (code) {
            case 2: // Layer name
              layer.name = value;
              break;
            case 62: // Color number
              layer.color = Math.abs(parseInt(value)); // Abs because negative means layer is off
              layer.off = parseInt(value) < 0;
              break;
            case 6: // Line type name
              layer.lineType = value;
              break;
            case 370: // Line weight
              layer.lineWeight = parseInt(value);
              break;
            case 70: // Flags
              const flags = parseInt(value);
              layer.frozen = (flags & 1) !== 0;
              layer.locked = (flags & 4) !== 0;
              break;
          }
        });
        
        layers.push(layer);
      }
    }
  }
  
  // Ensure default layer exists
  if (!layers.find(l => l.name === '0')) {
    layers.push({ name: '0' });
  }
  
  return layers;
}

/**
 * Validate layer properties
 */
export function validateLayer(layer: DxfLayer): boolean {
  // Layer must have a name
  if (!layer.name) {
    return false;
  }

  // Color must be a positive number if defined
  if (layer.color !== undefined && (isNaN(layer.color) || layer.color < 0)) {
    return false;
  }

  // Line weight must be a number if defined
  if (layer.lineWeight !== undefined && isNaN(layer.lineWeight)) {
    return false;
  }

  // Flags must be boolean if defined
  if (layer.frozen !== undefined && typeof layer.frozen !== 'boolean') {
    return false;
  }
  if (layer.locked !== undefined && typeof layer.locked !== 'boolean') {
    return false;
  }
  if (layer.off !== undefined && typeof layer.off !== 'boolean') {
    return false;
  }

  return true;
}

import { SiaLayer, SiaLayerKey } from '../../types/sia';
import { SiaQueries } from '../../database/sia-queries';
import { Feature, FeatureCollection } from 'geojson';

/**
 * Type for SIA field names
 */
type SiaField = 'agent' | 'element' | 'presentation' | 'scale' | 'phase' | 'status' | 'location' | 'projection';

/**
 * Interface for SIA layer database record
 */
interface SiaLayerRecord {
  id: number;
  name: string;
  sia_agent: string;
  sia_element: string;
  sia_presentation: string;
  sia_scale?: string;
  sia_phase?: string;
  sia_status?: string;
  sia_location?: string;
  sia_projection?: string;
  sia_free_typing?: any;
  sia_metadata?: any;
}

/**
 * Interface for SIA layer group
 */
interface SiaLayerGroup {
  id: string;
  name: string;
  type: SiaField;
  value: string;
  features: Feature[];
  children?: SiaLayerGroup[];
}

/**
 * Interface for SIA preview options
 */
interface SiaPreviewOptions {
  groupBy?: SiaField[];
  filter?: {
    agent?: string[];
    element?: string[];
    presentation?: string[];
    scale?: string[];
    phase?: string[];
    status?: string[];
    location?: string[];
    projection?: string[];
  };
  hierarchical?: boolean;
}

/**
 * Class for processing SIA layers for preview
 */
export class SiaLayerProcessor {
  private siaQueries: SiaQueries;

  constructor(siaQueries: SiaQueries) {
    this.siaQueries = siaQueries;
  }

  /**
   * Process features and group them by SIA fields
   */
  async processFeatures(
    features: Feature[],
    fileId: number,
    options: SiaPreviewOptions = {}
  ): Promise<FeatureCollection> {
    // Get SIA layer information
    const siaLayers = await this.siaQueries.getFileSiaLayers(fileId);
    const layerMap = new Map(siaLayers.map(layer => [layer.name, layer]));

    // Group features by SIA fields
    const groups = this.groupFeatures(features, layerMap, options);

    // Create feature collection
    return {
      type: 'FeatureCollection',
      features: this.flattenGroups(groups)
    };
  }

  /**
   * Group features by SIA fields
   */
  private groupFeatures(
    features: Feature[],
    layerMap: Map<string, SiaLayerRecord>,
    options: SiaPreviewOptions
  ): SiaLayerGroup[] {
    const { groupBy = ['agent', 'element'], hierarchical = true } = options;
    const groups: SiaLayerGroup[] = [];

    // Create initial groups
    const groupedFeatures = new Map<string, Feature[]>();

    features.forEach(feature => {
      const layerName = feature.properties?.layer;
      if (!layerName) return;

      const siaLayer = layerMap.get(layerName);
      if (!siaLayer) return;

      // Apply filters
      if (options.filter) {
        const matches = Object.entries(options.filter).every(([field, values]) => {
          if (!values || values.length === 0) return true;
          const layerValue = siaLayer[`sia_${field as SiaField}`];
          return values.includes(layerValue || '');
        });
        if (!matches) return;
      }

      // Create group key based on groupBy fields
      const groupKey = groupBy
        .map(field => siaLayer[`sia_${field}`])
        .filter(Boolean)
        .join('_');

      if (!groupedFeatures.has(groupKey)) {
        groupedFeatures.set(groupKey, []);
      }
      groupedFeatures.get(groupKey)?.push(feature);
    });

    // Create hierarchical groups
    if (hierarchical && groupBy.length > 1) {
      // Create top-level groups
      const topField = groupBy[0];
      const uniqueValues = new Set(Array.from(layerMap.values())
        .map(layer => layer[`sia_${topField}`])
        .filter(Boolean));

      uniqueValues.forEach(value => {
        if (!value) return;

        const group: SiaLayerGroup = {
          id: `${topField}_${value}`,
          name: value,
          type: topField,
          value,
          features: [],
          children: []
        };

        // Add subgroups
        const subField = groupBy[1];
        const subValues = new Set(Array.from(layerMap.values())
          .filter(layer => layer[`sia_${topField}`] === value)
          .map(layer => layer[`sia_${subField}`])
          .filter(Boolean));

        subValues.forEach(subValue => {
          if (!subValue) return;

          const groupKey = `${value}_${subValue}`;
          const features = groupedFeatures.get(groupKey) || [];

          const subGroup: SiaLayerGroup = {
            id: `${subField}_${subValue}`,
            name: subValue,
            type: subField,
            value: subValue,
            features
          };

          group.children?.push(subGroup);
        });

        groups.push(group);
      });
    } else {
      // Create flat groups
      groupedFeatures.forEach((features, key) => {
        const [value] = key.split('_');
        if (!value) return;

        const field = groupBy[0];
        groups.push({
          id: `${field}_${value}`,
          name: value,
          type: field,
          value,
          features
        });
      });
    }

    return groups;
  }

  /**
   * Flatten groups into a single feature array
   */
  private flattenGroups(groups: SiaLayerGroup[]): Feature[] {
    const features: Feature[] = [];

    const processGroup = (group: SiaLayerGroup) => {
      features.push(...group.features);
      group.children?.forEach(processGroup);
    };

    groups.forEach(processGroup);
    return features;
  }

  /**
   * Get unique values for a SIA field
   */
  async getFieldValues(
    fileId: number,
    field: SiaField
  ): Promise<string[]> {
    const layers = await this.siaQueries.getFileSiaLayers(fileId);
    return Array.from(new Set(
      layers
        .map(layer => layer[`sia_${field}`])
        .filter((value): value is string => typeof value === 'string')
    ));
  }

  /**
   * Create color scheme for SIA groups
   */
  createColorScheme(
    groups: SiaLayerGroup[],
    field: SiaField
  ): Record<string, string> {
    const colors: Record<string, string> = {};
    const baseHue = this.getBaseHue(field);
    const values = new Set(groups.map(g => g.value));
    const step = 360 / (values.size || 1);

    Array.from(values).forEach((value, index) => {
      const hue = (baseHue + index * step) % 360;
      colors[value] = `hsl(${hue}, 70%, 50%)`;
    });

    return colors;
  }

  /**
   * Get base hue for a SIA field
   */
  private getBaseHue(field: SiaField): number {
    switch (field) {
      case 'agent': return 0;       // Red
      case 'element': return 120;   // Green
      case 'presentation': return 240; // Blue
      case 'scale': return 60;      // Yellow
      case 'phase': return 180;     // Cyan
      case 'status': return 300;    // Magenta
      case 'location': return 30;   // Orange
      case 'projection': return 270; // Purple
      default: return 0;
    }
  }
} 
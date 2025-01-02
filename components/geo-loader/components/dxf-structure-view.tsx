import { useState, useEffect, useMemo } from 'react';
import { ScrollArea } from 'components/ui/scroll-area';
import { Switch } from 'components/ui/switch';
import { Label } from 'components/ui/label';
import { Alert } from 'components/ui/alert';
import { cn } from 'utils/cn';
import { 
  ChevronRight, 
  ChevronDown,
  Circle,
  Layers,
  Type,
  Box,
  Image,
  Settings,
  Grid,
  Tag,
  FileText,
  Cloud,
  Palette,
  Layout,
  Database,
  Eye,
  Download,
  AlertTriangle
} from 'lucide-react';
import { 
  DxfStructure,
  DxfEntity,
  DxfEntityType,
  DxfLayer,
  DxfBlock
} from '../core/processors/implementations/dxf/types';
import { LayerManager } from '../core/processors/implementations/dxf/utils/layer-manager';

interface DxfStructureViewProps {
  structure: DxfStructure;
  selectedLayers: string[];
  onLayerToggle: (layer: string, enabled: boolean) => void;
  visibleLayers: string[];
  onLayerVisibilityToggle: (layer: string, visible: boolean) => void;
  selectedEntityTypes: DxfEntityType[];
  onEntityTypeSelect: (type: DxfEntityType, enabled: boolean) => void;
  onElementSelect?: (elementInfo: { type: DxfEntityType, layer: string }) => void;
  /** Optional error callback */
  onError?: (error: string) => void;
}

interface EntityCount {
  total: number;
  byLayer: Record<string, number>;
}

interface EntityTypeInfo {
  label: string;
  description: string;
  icon: React.ReactNode;
  count: EntityCount;
}

interface TreeNodeProps {
  label: string;
  defaultExpanded?: boolean;
  icon?: React.ReactNode;
  count?: number;
  children?: React.ReactNode;
  onClick?: () => void;
  error?: string;
}

const getEntityTypeInfo = (type: DxfEntityType, count: EntityCount): EntityTypeInfo => {
  switch (type) {
    case 'POINT':
      return {
        label: 'Points',
        description: 'Single point locations',
        icon: <Circle className="h-4 w-4" />,
        count
      };
    case 'LINE':
      return {
        label: 'Lines',
        description: 'Simple line segments',
        icon: <Box className="h-4 w-4" />,
        count
      };
    case 'POLYLINE':
    case 'LWPOLYLINE':
      return {
        label: 'Polylines',
        description: 'Connected line segments',
        icon: <Box className="h-4 w-4" />,
        count
      };
    case 'CIRCLE':
      return {
        label: 'Circles',
        description: 'Perfect circles with radius',
        icon: <Circle className="h-4 w-4" />,
        count
      };
    case 'ARC':
      return {
        label: 'Arcs',
        description: 'Partial circular segments',
        icon: <Circle className="h-4 w-4" />,
        count
      };
    case 'TEXT':
    case 'MTEXT':
      return {
        label: 'Text',
        description: 'Text annotations',
        icon: <Type className="h-4 w-4" />,
        count
      };
    case 'FACE3D':
      return {
        label: '3D Faces',
        description: '3D surface elements',
        icon: <Box className="h-4 w-4" />,
        count
      };
    case 'ELLIPSE':
      return {
        label: 'Ellipses',
        description: 'Oval shapes',
        icon: <Circle className="h-4 w-4" />,
        count
      };
    case 'INSERT':
      return {
        label: 'Block References',
        description: 'Inserted block instances',
        icon: <Database className="h-4 w-4" />,
        count
      };
    case 'SPLINE':
      return {
        label: 'Splines',
        description: 'Smooth curves',
        icon: <Box className="h-4 w-4" />,
        count
      };
    case 'HATCH':
      return {
        label: 'Hatches',
        description: 'Fill patterns and boundaries',
        icon: <Grid className="h-4 w-4" />,
        count
      };
    case 'SOLID':
      return {
        label: 'Solids',
        description: '3D solid objects',
        icon: <Box className="h-4 w-4" />,
        count
      };
    case 'DIMENSION':
      return {
        label: 'Dimensions',
        description: 'Measurement annotations',
        icon: <Tag className="h-4 w-4" />,
        count
      };
    default:
      return {
        label: type,
        description: 'Other entity type',
        icon: <Box className="h-4 w-4" />,
        count
      };
  }
};

function TreeNode({ 
  label, 
  defaultExpanded = false, 
  icon, 
  count, 
  children, 
  onClick,
  error
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-1">
      <div 
        className={cn(
          "flex items-center gap-2 hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer p-1",
          error && "border-l-2 border-destructive"
        )}
        onClick={(e) => {
          if (onClick) {
            onClick();
          } else {
            setExpanded(!expanded);
          }
        }}
      >
        {children ? (
          expanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />
        ) : (
          <div className="w-3" /> // Spacing for alignment
        )}
        {icon && <div className="h-4 w-4 flex-shrink-0">{icon}</div>}
        <span className="text-xs flex-grow">{label}</span>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground">({count})</span>
        )}
      </div>
      {expanded && children && (
        <div className="ml-4 border-l pl-2 space-y-1">{children}</div>
      )}
    </div>
  );
}

export function DxfStructureView({ 
  structure,
  selectedLayers = [],
  onLayerToggle,
  visibleLayers = [],
  onLayerVisibilityToggle,
  selectedEntityTypes = [],
  onEntityTypeSelect,
  onElementSelect,
  onError
}: DxfStructureViewProps) {
  // Early return if structure is not available
  if (!structure) {
    return (
      <ScrollArea className="h-[400px] w-full rounded-md border p-2">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">No structure data available</span>
        </Alert>
      </ScrollArea>
    );
  }

  // Initialize layer manager
  const [layerManager] = useState(() => new LayerManager());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Setup layer manager when structure changes
  useEffect(() => {
    if (!structure?.layers) return;
    
    layerManager.clear();
    structure.layers.forEach(layer => {
      try {
        layerManager.addLayer(layer);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid layer';
        setValidationErrors(prev => ({
          ...prev,
          [layer.name]: message
        }));
        onError?.(message);
      }
    });
  }, [structure, layerManager, onError]);

  // Calculate styles and counts
  const [styles, entityCounts, elementsByLayer] = useMemo(() => {
    const lineTypes = new Set<string>();
    const textStyles = new Set<string>();
    const counts = new Map<DxfEntityType, EntityCount>();
    const byLayer = new Map<string, Map<DxfEntityType, number>>();

    // Process all entities including those in blocks
    const processEntities = (entities: DxfEntity[], parentLayer?: string) => {
      entities.forEach(entity => {
        const layer = parentLayer || entity.attributes.layer || '0';
        
        // Collect styles
        if (entity.attributes.lineType) {
          lineTypes.add(entity.attributes.lineType);
        }
        if ((entity.type === 'TEXT' || entity.type === 'MTEXT') && entity.data.style) {
          textStyles.add(entity.data.style);
        }

        // Update entity type counts
        const typeCount = counts.get(entity.type) || { total: 0, byLayer: {} };
        typeCount.total++;
        typeCount.byLayer[layer] = (typeCount.byLayer[layer] || 0) + 1;
        counts.set(entity.type, typeCount);

        // Update layer counts
        let layerCounts = byLayer.get(layer);
        if (!layerCounts) {
          layerCounts = new Map();
          byLayer.set(layer, layerCounts);
        }
        layerCounts.set(entity.type, (layerCounts.get(entity.type) || 0) + 1);

        // Process nested blocks
        if (entity.type === 'INSERT' && entity.blockName) {
          const block = (structure.blocks || []).find(b => b.name === entity.blockName);
          if (block) {
            processEntities(block.entities || [], layer);
          }
        }
      });
    };

    // Process all blocks
    (structure.blocks || []).forEach(block => {
      processEntities(block.entities || []);
    });

    return [{ lineTypes, textStyles }, counts, byLayer];
  }, [structure]);

  // Get all available layers and entity types
  const allLayers = structure?.layers?.map(l => l.name) || [];
  const allEntityTypes = Array.from(entityCounts.keys());
  
  // Calculate layer visibility states
  const validLayers = allLayers.filter(layer => !validationErrors[layer]);
  const visibleLayerCount = validLayers.filter(layer => visibleLayers.includes(layer)).length;
  const selectedLayerCount = validLayers.filter(layer => selectedLayers.includes(layer)).length;
  const selectedEntityTypeCount = allEntityTypes.filter(type => selectedEntityTypes.includes(type)).length;

  // Determine toggle states - a layer is only visible if it's in visibleLayers
  const allLayersVisible = validLayers.length > 0 && visibleLayerCount === validLayers.length;
  const someLayersVisible = visibleLayerCount > 0;
  const allLayersSelected = validLayers.length > 0 && selectedLayerCount === validLayers.length;
  const someLayersSelected = selectedLayerCount > 0;
  const allEntityTypesSelected = allEntityTypes.length > 0 && selectedEntityTypeCount === allEntityTypes.length;
  const someEntityTypesSelected = selectedEntityTypeCount > 0;

  // Handle toggle all layers visibility
  const handleToggleAllLayers = (visible: boolean) => {
    // When toggling all layers:
    // - If turning on: Add all valid layers to visibleLayers
    // - If turning off: Remove all layers (empty array)
    validLayers.forEach(layer => {
      onLayerVisibilityToggle(layer, visible);
    });
    
    console.debug('[DEBUG] Toggling all layers:', {
      action: visible ? 'show all' : 'hide all',
      allLayersVisible,
      someLayersVisible,
      validLayers,
      currentVisibleLayers: visibleLayers
    });
  };

  // Handle toggle all layers import
  const handleToggleAllLayersImport = (enabled: boolean) => {
    // Similar logic to visibility toggle
    const newState = !allLayersSelected || enabled;
    validLayers.forEach(layer => {
      onLayerToggle(layer, newState);
    });
  };

  // Handle toggle all entity types
  const handleToggleAllEntityTypes = (enabled: boolean) => {
    // Similar logic to layer toggles
    const newState = !allEntityTypesSelected || enabled;
    allEntityTypes.forEach(type => {
      onEntityTypeSelect(type, newState);
    });
  };

  return (
    <ScrollArea className="h-[400px] w-full rounded-md border p-2">
      <div className="space-y-4">
        {/* Detailing Symbol Styles */}
        <TreeNode 
          label="Detailing Symbol Styles" 
          icon={<Palette />}
          count={styles.lineTypes.size + styles.textStyles.size}
        >
          <TreeNode 
            label="Line Styles" 
            icon={<Box />}
            count={styles.lineTypes.size}
          >
            {Array.from(styles.lineTypes).map(lineType => (
              <TreeNode key={lineType} label={lineType} />
            ))}
          </TreeNode>

          <TreeNode 
            label="Text Styles" 
            icon={<Type />}
            count={styles.textStyles.size}
          >
            {Array.from(styles.textStyles).map(style => (
              <TreeNode key={style} label={style} />
            ))}
          </TreeNode>
        </TreeNode>

        {/* Layers */}
        <TreeNode 
          label="Layers" 
          icon={<Layers />}
          count={structure.layers?.length ?? 0}
          defaultExpanded
        >
          {/* Add master toggles for all layers */}
          <div className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span className="text-xs">Toggle All Layers</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                <Switch
                  checked={allLayersVisible}
                  onCheckedChange={handleToggleAllLayers}
                  className="scale-75"
                />
              </div>
              <div className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                <Switch
                  checked={allLayersSelected}
                  onCheckedChange={handleToggleAllLayersImport}
                  className="scale-75"
                />
              </div>
            </div>
          </div>

          {structure.layers?.map(layer => (
            <div key={layer.name} className="space-y-1">
              <div className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span className="text-xs">{layer.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({Array.from(elementsByLayer.get(layer.name)?.values() || []).reduce((a, b) => a + b, 0)})
                  </span>
                  {validationErrors[layer.name] && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    <Switch
                      checked={visibleLayers.includes(layer.name)}
                      onCheckedChange={(checked) => onLayerVisibilityToggle(layer.name, checked)}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    <Switch
                      checked={selectedLayers.includes(layer.name)}
                      onCheckedChange={(checked) => onLayerToggle(layer.name, checked)}
                      className="scale-75"
                    />
                  </div>
                </div>
              </div>
              {elementsByLayer.get(layer.name) && (
                <div className="ml-6 space-y-1">
                  {Array.from(elementsByLayer.get(layer.name)!.entries()).map(([type, count]) => {
                    const typeInfo = getEntityTypeInfo(type, entityCounts.get(type) || { total: 0, byLayer: {} });
                    return (
                      <div 
                        key={type} 
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:bg-accent rounded-sm cursor-pointer p-1"
                        onClick={() => onElementSelect?.({ type, layer: layer.name })}
                      >
                        {typeInfo.icon}
                        <span>{typeInfo.label}</span>
                        <span>({count})</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </TreeNode>

        {/* Models */}
        {(structure.blocks?.length ?? 0) > 0 && (
          <TreeNode 
            label="Models" 
            icon={<Layout />}
            count={structure.blocks?.length ?? 0}
          >
            {(structure.blocks || []).map(block => (
              <TreeNode 
                key={block.name} 
                label={block.name}
                icon={<Database />}
                count={block.entities?.length ?? 0}
              >
                {Object.entries(
                  (block.entities || []).reduce((acc, entity) => {
                    acc[entity.type] = (acc[entity.type] || 0) + 1;
                    return acc;
                  }, {} as Record<DxfEntityType, number>)
                ).map(([type, count]) => {
                  const typeInfo = getEntityTypeInfo(type as DxfEntityType, entityCounts.get(type as DxfEntityType) || { total: 0, byLayer: {} });
                  return (
                    <div 
                      key={type} 
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:bg-accent rounded-sm cursor-pointer p-1"
                      onClick={() => onElementSelect?.({ type: type as DxfEntityType, layer: block.name })}
                    >
                      {typeInfo.icon}
                      <span>{typeInfo.label}</span>
                      <span>({count})</span>
                    </div>
                  );
                })}
              </TreeNode>
            ))}
          </TreeNode>
        )}

        {/* Entity Types */}
        <TreeNode 
          label="Entity Types" 
          icon={<Grid />}
          count={entityCounts.size}
          defaultExpanded
        >
          {/* Add master toggle for all entity types */}
          <div className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
            <div className="flex items-center gap-2">
              <Grid className="h-4 w-4" />
              <span className="text-xs">Toggle All Types</span>
            </div>
            <div className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              <Switch
                checked={allEntityTypesSelected}
                onCheckedChange={handleToggleAllEntityTypes}
                className="scale-75"
              />
            </div>
          </div>

          {Array.from(entityCounts.entries()).map(([type, count]) => {
            const typeInfo = getEntityTypeInfo(type, count);
            return (
              <div 
                key={type} 
                className="flex items-center justify-between p-1 hover:bg-accent rounded-sm group"
              >
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4">{typeInfo.icon}</div>
                  <div>
                    <Label className="text-xs cursor-pointer">
                      {typeInfo.label} ({count.total})
                    </Label>
                    {typeInfo.description && (
                      <p className="text-xs text-muted-foreground hidden group-hover:block">
                        {typeInfo.description}
                      </p>
                    )}
                  </div>
                </div>
                <Switch
                  checked={selectedEntityTypes.includes(type)}
                  onCheckedChange={(checked) => onEntityTypeSelect(type, checked)}
                  className="scale-75"
                />
              </div>
            );
          })}
        </TreeNode>
      </div>
    </ScrollArea>
  );
}

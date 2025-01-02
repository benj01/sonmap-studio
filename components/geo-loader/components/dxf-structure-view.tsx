"use client";

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
          "flex items-center gap-2 hover:bg-accent hover:text-accent-foreground rounded-sm p-1",
          error && "border-l-2 border-destructive",
          onClick ? "cursor-pointer" : ""
        )}
      >
        {/* Expansion chevron */}
        {children ? (
          <div 
            className="cursor-pointer" 
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 
              <ChevronDown className="h-3 w-3 flex-shrink-0" /> : 
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
            }
          </div>
        ) : (
          <div className="w-3" /> // Spacing for alignment
        )}
        
        {/* Main content area */}
        <div 
          className="flex items-center gap-2 flex-grow"
          onClick={() => {
            if (onClick) {
              onClick();
            } else if (children) {
              setExpanded(!expanded);
            }
          }}
        >
          {icon && <div className="h-4 w-4 flex-shrink-0">{icon}</div>}
          <span className="text-xs flex-grow">{label}</span>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
        </div>
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
    console.debug('[DEBUG] No structure data available');
    return (
      <ScrollArea className="h-[400px] w-full rounded-md border p-2">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">No structure data available</span>
        </Alert>
      </ScrollArea>
    );
  }

  // Initialize layer manager with debug logging
  const [layerManager] = useState(() => {
    console.debug('[DEBUG] Initializing layer manager');
    return new LayerManager();
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Setup layer manager and initialize visible layers when structure changes
  useEffect(() => {
    if (!structure?.layers) {
      console.debug('[DEBUG] No layers in structure');
      return;
    }
    
    console.debug('[DEBUG] Setting up layer manager with layers:', structure.layers);
    layerManager.clear();
    
    // Initialize all layers as visible if visibleLayers is empty
    if (visibleLayers.length === 0 && onLayerVisibilityToggle) {
      console.debug('[DEBUG] Initializing all layers as visible');
      structure.layers.forEach(layer => {
        console.debug('[DEBUG] Setting initial visibility for layer:', layer.name);
        onLayerVisibilityToggle(layer.name, true);
      });
    } else {
      console.debug('[DEBUG] Using existing visibility state:', visibleLayers);
    }

    structure.layers.forEach(layer => {
      try {
        layerManager.addLayer(layer);
        console.debug('[DEBUG] Layer added to manager:', { 
          name: layer.name, 
          visible: visibleLayers.includes(layer.name) 
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid layer';
        console.debug('[DEBUG] Layer validation error:', { layer: layer.name, error: message });
        setValidationErrors(prev => ({
          ...prev,
          [layer.name]: message
        }));
        onError?.(message);
      }
    });
  }, [structure, layerManager, onError, visibleLayers, onLayerVisibilityToggle]);

  // Listen for layer visibility changes
  useEffect(() => {
    const handleVisibilityChange = (event: CustomEvent) => {
      const { layer, visible, visibleLayers: newVisibleLayers } = event.detail;
      console.debug('[DEBUG] Layer visibility changed event:', {
        layer,
        visible,
        allVisibleLayers: newVisibleLayers
      });
    };

    window.addEventListener('layer-visibility-changed', handleVisibilityChange as EventListener);
    return () => {
      window.removeEventListener('layer-visibility-changed', handleVisibilityChange as EventListener);
    };
  }, []);

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
  
  // Calculate layer visibility states - do not filter by validation errors for visibility
  const visibleLayerCount = allLayers.filter(layer => visibleLayers.includes(layer)).length;
  const selectedLayerCount = allLayers.filter(layer => selectedLayers.includes(layer)).length;
  const selectedEntityTypeCount = allEntityTypes.filter(type => selectedEntityTypes.includes(type)).length;

  // Determine toggle states - a layer is only visible if it's in visibleLayers
  const allLayersVisible = allLayers.length > 0 && visibleLayerCount === allLayers.length;
  const someLayersVisible = visibleLayerCount > 0;
  const allLayersSelected = allLayers.length > 0 && selectedLayerCount === allLayers.length;
  const someLayersSelected = selectedLayerCount > 0;
  const allEntityTypesSelected = allEntityTypes.length > 0 && selectedEntityTypeCount === allEntityTypes.length;
  const someEntityTypesSelected = selectedEntityTypeCount > 0;

  // Handle toggle all layers visibility with debug logging
  const handleToggleAllLayers = (visible: boolean) => {
    console.debug('[DEBUG] Toggle all layers visibility:', { visible, layers: allLayers });
    allLayers.forEach(layer => {
      console.debug('[DEBUG] Toggling layer visibility:', { layer, visible });
      onLayerVisibilityToggle(layer, visible);
    });
  };

  // Handle toggle all layers import with debug logging
  const handleToggleAllLayersImport = (enabled: boolean) => {
    console.debug('[DEBUG] Toggle all layers import:', { enabled, layers: allLayers });
    allLayers.forEach(layer => {
      console.debug('[DEBUG] Toggling layer import:', { layer, enabled });
      onLayerToggle(layer, enabled);
    });
  };

  // Handle toggle all entity types with debug logging
  const handleToggleAllEntityTypes = (enabled: boolean) => {
    console.debug('[DEBUG] Toggle all entity types:', { enabled, types: allEntityTypes });
    allEntityTypes.forEach(type => {
      console.debug('[DEBUG] Toggling entity type:', { type, enabled });
      onEntityTypeSelect(type, enabled);
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span className="text-sm font-medium">Layers</span>
              <span className="text-xs text-muted-foreground">
                ({structure.layers?.length ?? 0})
              </span>
            </div>
          </div>

          {/* Layer Controls */}
          <div className="space-y-1">
            {/* Toggle All Controls */}
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs">Toggle All Layers</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-3 w-3" />
                  <Switch
                    id="toggle-all-layers-visible"
                    checked={allLayersVisible}
                    onCheckedChange={(checked) => {
                      console.debug('[DEBUG] Toggle all layers visibility:', { checked });
                      handleToggleAllLayers(checked);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Download className="h-3 w-3" />
                  <Switch
                    id="toggle-all-layers-selected"
                    checked={allLayersSelected}
                    onCheckedChange={(checked) => {
                      console.debug('[DEBUG] Toggle all layers selection:', { checked });
                      handleToggleAllLayersImport(checked);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Individual Layer Controls */}
            <div className="space-y-1">
              {structure.layers?.map(layer => {
                const isVisible = visibleLayers.includes(layer.name);
                const elementCount = Array.from(elementsByLayer.get(layer.name)?.values() || []).reduce((a, b) => a + b, 0);
                const hasError = !!validationErrors[layer.name];
                
                console.debug('[DEBUG] Rendering layer control:', {
                  layer: layer.name,
                  isVisible,
                  elementCount,
                  hasError
                });

                return (
                  <div 
                    key={layer.name}
                    className="flex items-center justify-between p-2 hover:bg-accent rounded-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      <span className="text-xs">{layer.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({elementCount})
                      </span>
                      {hasError && (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Eye className={cn("h-3 w-3", isVisible ? "text-primary" : "text-muted-foreground")} />
                        <Switch
                          id={`layer-visible-${layer.name}`}
                          checked={isVisible}
                          onCheckedChange={(checked) => {
                            console.debug('[DEBUG] Layer visibility toggle clicked:', {
                              layer: layer.name,
                              currentlyVisible: isVisible,
                              newState: checked
                            });
                            onLayerVisibilityToggle(layer.name, checked);
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Download className="h-3 w-3" />
                        <Switch
                          id={`layer-selected-${layer.name}`}
                          checked={selectedLayers.includes(layer.name)}
                          onCheckedChange={(checked) => {
                            console.debug('[DEBUG] Layer selection toggle:', { layer: layer.name, checked });
                            onLayerToggle(layer.name, checked);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Entity Types */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid className="h-4 w-4" />
              <span className="text-sm font-medium">Entity Types</span>
              <span className="text-xs text-muted-foreground">
                ({entityCounts.size})
              </span>
            </div>
          </div>

          {/* Entity Type Controls */}
          <div className="space-y-1">
            {/* Toggle All Types */}
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs">Toggle All Types</span>
              </div>
              <div className="flex items-center gap-2">
                <Download className="h-3 w-3" />
                <Switch
                  id="toggle-all-types"
                  checked={allEntityTypesSelected}
                  onCheckedChange={(checked) => {
                    console.debug('[DEBUG] Toggle all entity types:', { checked });
                    handleToggleAllEntityTypes(checked);
                  }}
                />
              </div>
            </div>

            {/* Individual Entity Types */}
            <div className="space-y-1">
              {Array.from(entityCounts.entries()).map(([type, count]) => {
                const typeInfo = getEntityTypeInfo(type, count);
                return (
                  <div 
                    key={type}
                    className="flex items-center justify-between p-2 hover:bg-accent rounded-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4">{typeInfo.icon}</div>
                      <div>
                        <span className="text-xs">
                          {typeInfo.label} ({count.total})
                        </span>
                        {typeInfo.description && (
                          <p className="text-xs text-muted-foreground">
                            {typeInfo.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Download className="h-3 w-3" />
                      <Switch
                        id={`entity-type-${type}`}
                        checked={selectedEntityTypes.includes(type)}
                        onCheckedChange={(checked) => {
                          console.debug('[DEBUG] Entity type toggle:', { type, checked });
                          onEntityTypeSelect(type, checked);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

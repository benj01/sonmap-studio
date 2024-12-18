import { useState } from 'react';
import { ScrollArea } from 'components/ui/scroll-area';
import { Switch } from 'components/ui/switch';
import { Label } from 'components/ui/label';
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
  Download
} from 'lucide-react';
import { DxfData } from '../utils/dxf/types';

interface DxfStructureViewProps {
  dxfData: DxfData;
  selectedLayers: string[];
  onLayerToggle: (layer: string, enabled: boolean) => void;
  visibleLayers: string[];
  onLayerVisibilityToggle: (layer: string, visible: boolean) => void;
  selectedTemplates: string[];
  onTemplateSelect: (template: string, enabled: boolean) => void;
  onElementSelect?: (elementInfo: { type: string, layer: string }) => void;
}

interface TreeNodeProps {
  label: string;
  defaultExpanded?: boolean;
  icon?: React.ReactNode;
  count?: number;
  children?: React.ReactNode;
  onClick?: () => void;
}

interface EntityTypeInfo {
  label: string;
  description?: string;
  icon: React.ReactNode;
}

const getEntityTypeInfo = (type: string): EntityTypeInfo => {
  switch (type) {
    case 'POINT':
      return {
        label: 'Points',
        description: 'Single point locations',
        icon: <Circle className="h-4 w-4" />
      };
    case 'LINE':
      return {
        label: 'Lines',
        description: 'Simple line segments',
        icon: <Box className="h-4 w-4" />
      };
    case 'POLYLINE':
    case 'LWPOLYLINE':
      return {
        label: 'Polylines',
        description: 'Connected line segments',
        icon: <Box className="h-4 w-4" />
      };
    case 'CIRCLE':
      return {
        label: 'Circles',
        description: 'Perfect circles with radius',
        icon: <Circle className="h-4 w-4" />
      };
    case 'ARC':
      return {
        label: 'Arcs',
        description: 'Partial circular segments',
        icon: <Circle className="h-4 w-4" />
      };
    case 'TEXT':
    case 'MTEXT':
      return {
        label: 'Text',
        description: 'Text annotations',
        icon: <Type className="h-4 w-4" />
      };
    case '3DFACE':
      return {
        label: '3D Faces',
        description: '3D surface elements',
        icon: <Box className="h-4 w-4" />
      };
    case 'ELLIPSE':
      return {
        label: 'Ellipses',
        description: 'Oval shapes',
        icon: <Circle className="h-4 w-4" />
      };
    case 'INSERT':
      return {
        label: 'Block References',
        description: 'Inserted block instances',
        icon: <Database className="h-4 w-4" />
      };
    case 'SPLINE':
      return {
        label: 'Splines',
        description: 'Smooth curves',
        icon: <Box className="h-4 w-4" />
      };
    default:
      return {
        label: type,
        icon: <Box className="h-4 w-4" />
      };
  }
};

function TreeNode({ label, defaultExpanded = false, icon, count, children, onClick }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-1">
      <div 
        className="flex items-center gap-2 hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer p-1"
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

function calculateTotalCount(elements: Record<string, number>): number {
  return Object.values(elements).reduce((a, b) => a + b, 0);
}

export function DxfStructureView({ 
  dxfData, 
  selectedLayers = [],
  onLayerToggle,
  visibleLayers = [],
  onLayerVisibilityToggle,
  selectedTemplates = [],
  onTemplateSelect,
  onElementSelect
}: DxfStructureViewProps) {
  // Extract styles and counts
  const lineTypes = new Set<string>();
  const textStyles = new Set<string>();
  const entityCounts: Record<string, number> = {};
  const elementsByLayer: Record<string, Record<string, number>> = {};

  // Process entities and calculate counts including INSERT entities
  function processEntities(entities: any[], parentLayer?: string) {
    entities.forEach(entity => {
      const layer = parentLayer || entity.layer;
      
      // Count entities by type
      entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;

      // Count entities by layer and type
      if (layer) {
        if (!elementsByLayer[layer]) {
          elementsByLayer[layer] = {};
        }
        elementsByLayer[layer][entity.type] = 
          (elementsByLayer[layer][entity.type] || 0) + 1;
      }

      // Collect styles
      if (entity.lineType) lineTypes.add(entity.lineType);
      if ((entity.type === 'TEXT' || entity.type === 'MTEXT') && entity.style) {
        textStyles.add(entity.style);
      }

      // Process block references (INSERT entities)
      if (entity.type === 'INSERT' && entity.block && dxfData.blocks?.[entity.block]) {
        processEntities(dxfData.blocks[entity.block].entities, layer);
      }
    });
  }

  processEntities(dxfData.entities);

  // Get all available layers
  const allLayers = Object.keys(dxfData.tables?.layer?.layers || {});
  
  // Handle toggle all layers visibility
  const handleToggleAllLayers = (visible: boolean) => {
    allLayers.forEach(layer => {
      onLayerVisibilityToggle(layer, visible);
    });
  };

  // Handle toggle all layers import
  const handleToggleAllLayersImport = (enabled: boolean) => {
    allLayers.forEach(layer => {
      onLayerToggle(layer, enabled);
    });
  };

  // Handle toggle all templates
  const handleToggleAllTemplates = (enabled: boolean) => {
    Object.keys(entityCounts).forEach(type => {
      onTemplateSelect(type, enabled);
    });
  };

  // Check if all layers/templates are visible/selected
  const allLayersVisible = allLayers.length > 0 && allLayers.every(layer => visibleLayers.includes(layer));
  const allLayersSelected = allLayers.length > 0 && allLayers.every(layer => selectedLayers.includes(layer));
  const allTemplatesSelected = Object.keys(entityCounts).length > 0 && 
    Object.keys(entityCounts).every(type => selectedTemplates.includes(type));

  return (
    <ScrollArea className="h-[400px] w-full rounded-md border p-2">
      <div className="space-y-4">
        {/* Detailing Symbol Styles */}
        <TreeNode 
          label="Detailing Symbol Styles" 
          icon={<Palette />}
          count={lineTypes.size + textStyles.size}
        >
          <TreeNode 
            label="Line Styles" 
            icon={<Box />}
            count={lineTypes.size}
          >
            {Array.from(lineTypes).map(lineType => (
              <TreeNode key={lineType} label={lineType} />
            ))}
          </TreeNode>

          <TreeNode 
            label="Text Styles" 
            icon={<Type />}
            count={textStyles.size}
          >
            {Array.from(textStyles).map(style => (
              <TreeNode key={style} label={style} />
            ))}
          </TreeNode>
        </TreeNode>

        {/* Layers */}
        <TreeNode 
          label="Layers" 
          icon={<Layers />}
          count={Object.keys(dxfData.tables?.layer?.layers || {}).length}
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

          {dxfData.tables?.layer?.layers && Object.entries(dxfData.tables.layer.layers).map(([name, layer]) => (
            <div key={name} className="space-y-1">
              <div className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span className="text-xs">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({calculateTotalCount(elementsByLayer[name] || {})})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    <Switch
                      checked={visibleLayers.includes(name)}
                      onCheckedChange={(checked) => onLayerVisibilityToggle(name, checked)}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    <Switch
                      checked={selectedLayers.includes(name)}
                      onCheckedChange={(checked) => onLayerToggle(name, checked)}
                      className="scale-75"
                    />
                  </div>
                </div>
              </div>
              {elementsByLayer[name] && (
                <div className="ml-6 space-y-1">
                  {Object.entries(elementsByLayer[name]).map(([type, count]) => {
                    const typeInfo = getEntityTypeInfo(type);
                    return (
                      <div 
                        key={type} 
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:bg-accent rounded-sm cursor-pointer p-1"
                        onClick={() => onElementSelect?.({ type, layer: name })}
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
        {dxfData.blocks && Object.keys(dxfData.blocks).length > 0 && (
          <TreeNode 
            label="Models" 
            icon={<Layout />}
            count={Object.keys(dxfData.blocks).length}
          >
            {Object.entries(dxfData.blocks).map(([name, block]) => (
              <TreeNode 
                key={name} 
                label={name}
                icon={<Database />}
                count={block.entities.length}
              >
                {Object.entries(
                  block.entities.reduce((acc, entity) => {
                    acc[entity.type] = (acc[entity.type] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([type, count]) => {
                  const typeInfo = getEntityTypeInfo(type);
                  return (
                    <div 
                      key={type} 
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:bg-accent rounded-sm cursor-pointer p-1"
                      onClick={() => onElementSelect?.({ type, layer: name })}
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
          count={Object.keys(entityCounts).length}
          defaultExpanded
        >
          {/* Add master toggle for all templates */}
          <div className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
            <div className="flex items-center gap-2">
              <Grid className="h-4 w-4" />
              <span className="text-xs">Toggle All Types</span>
            </div>
            <div className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              <Switch
                checked={allTemplatesSelected}
                onCheckedChange={handleToggleAllTemplates}
                className="scale-75"
              />
            </div>
          </div>

          {Object.entries(entityCounts).map(([type, count]) => {
            const typeInfo = getEntityTypeInfo(type);
            return (
              <div 
                key={type} 
                className="flex items-center justify-between p-1 hover:bg-accent rounded-sm group"
              >
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4">{typeInfo.icon}</div>
                  <div>
                    <Label className="text-xs cursor-pointer">
                      {typeInfo.label} ({count})
                    </Label>
                    {typeInfo.description && (
                      <p className="text-xs text-muted-foreground hidden group-hover:block">
                        {typeInfo.description}
                      </p>
                    )}
                  </div>
                </div>
                <Switch
                  checked={selectedTemplates.includes(type)}
                  onCheckedChange={(checked) => onTemplateSelect(type, checked)}
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

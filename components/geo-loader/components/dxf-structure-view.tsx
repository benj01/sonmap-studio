import { useState } from 'react';
import { ScrollArea } from 'components/ui/scroll-area';
import { Switch } from 'components/ui/switch';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group';
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
  Database
} from 'lucide-react';
import { DxfData } from '../utils/dxf/types';

interface DxfStructureViewProps {
  dxfData: DxfData;
  selectedLayers: string[];
  onLayerToggle: (layer: string, enabled: boolean) => void;
  selectedTemplate?: string;
  onTemplateSelect?: (template: string) => void;
}

interface TreeNodeProps {
  label: string;
  defaultExpanded?: boolean;
  icon?: React.ReactNode;
  count?: number;
  children?: React.ReactNode;
}

function TreeNode({ label, defaultExpanded = false, icon, count, children }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-1">
      <div 
        className="flex items-center gap-2 hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer p-1"
        onClick={() => setExpanded(!expanded)}
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

function getEntityIcon(type: string) {
  switch (type) {
    case 'LINE':
    case 'POLYLINE':
    case 'LWPOLYLINE':
      return <Box className="h-4 w-4" />;
    case 'TEXT':
    case 'MTEXT':
      return <Type className="h-4 w-4" />;
    case 'INSERT':
      return <Database className="h-4 w-4" />;
    case 'POINT':
      return <Circle className="h-4 w-4" />;
    default:
      return <Box className="h-4 w-4" />;
  }
}

export function DxfStructureView({ 
  dxfData, 
  selectedLayers, 
  onLayerToggle,
  selectedTemplate,
  onTemplateSelect 
}: DxfStructureViewProps) {
  // Extract styles and counts
  const lineTypes = new Set<string>();
  const textStyles = new Set<string>();
  const entityCounts: Record<string, number> = {};
  const elementsByLayer: Record<string, Record<string, number>> = {};

  dxfData.entities.forEach(entity => {
    // Count entities by type
    entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;

    // Count entities by layer and type
    if (entity.layer) {
      if (!elementsByLayer[entity.layer]) {
        elementsByLayer[entity.layer] = {};
      }
      elementsByLayer[entity.layer][entity.type] = 
        (elementsByLayer[entity.layer][entity.type] || 0) + 1;
    }

    // Collect styles
    if (entity.lineType) lineTypes.add(entity.lineType);
    if ((entity.type === 'TEXT' || entity.type === 'MTEXT') && (entity as any).style) {
      textStyles.add((entity as any).style);
    }
  });

  const totalElements = Object.values(entityCounts).reduce((a, b) => a + b, 0);

  return (
    <ScrollArea className="h-[400px] w-full rounded-md border p-2">
      <div className="space-y-4">
        {/* Detailing Symbol Styles */}
        <TreeNode 
          label="Detailing Symbol Styles" 
          icon={<Palette />}
          count={Object.keys(lineTypes).length + Object.keys(textStyles).length}
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

        {/* Display Styles */}
        <TreeNode label="Display Styles" icon={<Image />} />

        {/* Environment Setups */}
        <TreeNode label="Environment Setups" icon={<Settings />} />

        {/* Layers */}
        <TreeNode 
          label="Layers" 
          icon={<Layers />}
          count={Object.keys(dxfData.tables?.layer?.layers || {}).length}
          defaultExpanded
        >
          {dxfData.tables?.layer?.layers && Object.entries(dxfData.tables.layer.layers).map(([name, layer]) => (
            <div key={name} className="space-y-1">
              <div className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span className="text-xs">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({Object.values(elementsByLayer[name] || {}).reduce((a, b) => a + b, 0)})
                  </span>
                </div>
                <Switch
                  checked={selectedLayers.includes(name)}
                  onCheckedChange={(checked) => onLayerToggle(name, checked)}
                  className="scale-75"
                />
              </div>
              {elementsByLayer[name] && (
                <div className="ml-6 space-y-1">
                  {Object.entries(elementsByLayer[name]).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 text-xs text-muted-foreground">
                      {getEntityIcon(type)}
                      <span>{type}</span>
                      <span>({count})</span>
                    </div>
                  ))}
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
                ).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2 text-xs text-muted-foreground">
                    {getEntityIcon(type)}
                    <span>{type}</span>
                    <span>({count})</span>
                  </div>
                ))}
              </TreeNode>
            ))}
          </TreeNode>
        )}

        {/* Element Templates */}
        <TreeNode 
          label="Element Templates" 
          icon={<Grid />}
          count={Object.keys(entityCounts).length}
          defaultExpanded
        >
          <RadioGroup 
            value={selectedTemplate} 
            onValueChange={onTemplateSelect}
            className="space-y-1"
          >
            {Object.entries(entityCounts).map(([type, count]) => (
              <div key={type} className="flex items-center space-x-2 p-1 hover:bg-accent rounded-sm">
                <RadioGroupItem value={type} id={type} className="scale-75" />
                <div className="h-4 w-4">{getEntityIcon(type)}</div>
                <Label htmlFor={type} className="text-xs cursor-pointer">
                  {type} ({count})
                </Label>
              </div>
            ))}
          </RadioGroup>
        </TreeNode>

        {/* Additional Bentley-style categories */}
        <TreeNode label="Point Cloud Styles" icon={<Cloud />} />
        <TreeNode label="Render Setups" icon={<Image />} />
        <TreeNode label="Report Definitions" icon={<FileText />} />
        <TreeNode label="Tag Sets" icon={<Tag />} />
      </div>
    </ScrollArea>
  );
}

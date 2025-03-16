'use client';

import { useCesiumLayers } from '../../hooks/useCesiumLayers';
import { useCesium } from '../../context/CesiumContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, Layers, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CesiumLayerList';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
    console.log(`[${SOURCE}] ${message}`, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
    console.warn(`[${SOURCE}] ${message}`, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
    console.error(`[${SOURCE}] ${message}`, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
    console.debug(`[${SOURCE}] ${message}`, data);
  }
};

interface CesiumLayerListProps {
  projectId: string;
}

export function CesiumLayerList({ projectId }: CesiumLayerListProps) {
  const { isInitialized } = useCesium();
  const { layers, loading, error, toggleLayerVisibility, removeLayer } = useCesiumLayers(projectId);

  if (!isInitialized) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground">Initializing 3D viewer...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[50px]" />
        </div>
        <Skeleton className="h-[40px] w-full" />
        <Skeleton className="h-[40px] w-full" />
        <Skeleton className="h-[40px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border rounded-md bg-destructive/10 text-destructive">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="h-4 w-4" />
          <p className="font-medium">Error loading 3D layers</p>
        </div>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (layers.length === 0) {
    return (
      <div className="p-4 text-center border rounded-md bg-muted">
        <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-muted-foreground">No 3D layers available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">3D Layers</h3>
        <Badge variant="outline" className="text-xs">
          {layers.length} layer{layers.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      
      <Accordion type="multiple" className="w-full">
        {layers.map((layer) => (
          <AccordionItem key={layer.id} value={layer.id}>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={layer.visible} 
                  onCheckedChange={() => toggleLayerVisibility(layer.id)}
                  aria-label={`Toggle ${layer.name} visibility`}
                />
                <span className={layer.visible ? 'text-foreground' : 'text-muted-foreground'}>
                  {layer.name}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">
                  {layer.type}
                </Badge>
                <AccordionTrigger className="h-4 w-4 p-0" />
              </div>
            </div>
            <AccordionContent>
              <div className="pl-8 pr-2 pb-2 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Type:</span>
                  <span className="text-sm">{layer.type}</span>
                </div>
                
                <div className="flex justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeLayer(layer.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
} 
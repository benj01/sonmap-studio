import { LoaderResult, LoaderOptions } from 'types/geo';
import { CoordinateSystem } from '../../types/coordinates';
import { DxfData } from '../../utils/dxf/types';
import { FeatureCollection } from 'geojson';

export interface LogEntry {
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: Date;
}

export type LogType = LogEntry['type'];

// Make ImportOptions extend LoaderOptions to ensure compatibility
export interface ImportOptions extends LoaderOptions {
  selectedLayers: string[];
  visibleLayers: string[];
  selectedTemplates: string[];
  coordinateSystem?: CoordinateSystem;
}

export interface ImportState {
  logs: LogEntry[];
  hasErrors: boolean;
  selectedLayers: string[];
  visibleLayers: string[];
  selectedTemplates: string[];
}

export interface PreviewSectionProps {
  preview: FeatureCollection;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  coordinateSystem?: CoordinateSystem;
  visibleLayers: string[];
}

export interface SettingsSectionProps {
  file: File;
  dxfData: DxfData | undefined;  // Changed from null to undefined
  analysis: any;
  options: ImportOptions;
  selectedLayers: string[];
  visibleLayers: string[];
  selectedTemplates: string[];
  onLayerToggle: (layer: string, enabled: boolean) => void;
  onLayerVisibilityToggle: (layer: string, visible: boolean) => void;
  onTemplateSelect: (template: string, enabled: boolean) => void;
  onCoordinateSystemChange: (value: string) => void;
}

export interface LogsSectionProps {
  logs: LogEntry[];
  loading: boolean;
  hasErrors: boolean;
  onClearAndClose: () => void;
}

export interface GeoImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  onImportComplete: (result: LoaderResult) => void;
}

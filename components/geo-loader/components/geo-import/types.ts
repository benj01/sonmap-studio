import { LoaderResult, LoaderOptions } from 'types/geo';
import { CoordinateSystem } from '../../types/coordinates';
import { DxfData } from '../../utils/dxf/types';
import { PreviewManager } from '../../preview/preview-manager';
import { Analysis } from '../../types/map';
import { ErrorReporter, Severity } from '../../utils/errors';

export interface LogEntry {
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: Date;
  severity: Severity;
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
  previewManager: PreviewManager;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  coordinateSystem?: CoordinateSystem;
  visibleLayers: string[];
  analysis?: Analysis;
  errorReporter: ErrorReporter;
}

export interface SettingsSectionProps {
  file: File;
  dxfData: DxfData | undefined;
  analysis: any;
  options: ImportOptions;
  selectedLayers: string[];
  visibleLayers: string[];
  selectedTemplates: string[];
  onLayerToggle: (layer: string, enabled: boolean) => void;
  onLayerVisibilityToggle: (layer: string, visible: boolean) => void;
  onTemplateSelect: (template: string, enabled: boolean) => void;
  onCoordinateSystemChange: (value: string) => void;
  pendingCoordinateSystem?: CoordinateSystem;
  onApplyCoordinateSystem?: () => void;
  errorReporter: ErrorReporter;
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
  errorReporter: ErrorReporter;
}

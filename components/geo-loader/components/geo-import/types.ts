import { LoaderResult, LoaderOptions } from 'types/geo';
import { CoordinateSystem } from '../../types/coordinates';
import { DxfStructure } from '../../core/processors/implementations/dxf/types';
import { PreviewManager } from '../../preview/preview-manager';
import { AnalyzeResult, ProcessorResult } from '../../core/processors/base/types';

export interface LogDetails {
  source?: 'points' | 'header' | 'fallback';
  confidence?: number;
  reason?: string;
  system?: string;
  alternatives?: Array<{
    system: string;
    confidence: number;
    reason: string;
  }>;
  [key: string]: any;
}

export interface LogEntry {
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: Date;
  code?: string;
  details?: LogDetails;
}

export type LogType = LogEntry['type'];

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

export interface PreviewAnalysis {
  warnings: Array<{
    type: string;
    message: string;
  }>;
  statistics?: ProcessorResult['statistics'];
  coordinateSystem?: CoordinateSystem;
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
  analysis?: PreviewAnalysis;
}

export interface SettingsSectionProps {
  file: File;
  dxfData: DxfStructure | undefined;
  analysis: AnalyzeResult | undefined;
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

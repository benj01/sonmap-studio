import React, { createContext, useContext, useState, ReactNode } from 'react';

// Types for wizard state (expand as needed)
export interface WizardFileInfo {
  id?: string;
  name?: string;
  size?: number;
  type?: string;
  companions?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
  }>;
}

export interface WizardDataset {
  // Add fields as needed (features, metadata, etc.)
  features?: any[];
  metadata?: any;
}

export interface HeightSource {
  type: 'z' | 'none';
  status: 'detected' | 'not_detected';
  message: string;
}

export interface WizardState {
  projectId: string;
  fileInfo?: WizardFileInfo;
  setFileInfo: (info: WizardFileInfo) => void;
  dataset?: WizardDataset;
  setDataset: (ds: WizardDataset) => void;
  importDataset?: WizardDataset;
  setImportDataset: (ds: WizardDataset) => void;
  selectedFeatureIds: number[];
  setSelectedFeatureIds: (ids: number[] | ((prev: number[]) => number[])) => void;
  heightSource: HeightSource;
  setHeightSource: (source: HeightSource) => void;
  targetSrid: number;
  setTargetSrid: (srid: number) => void;
}

const WizardContext = createContext<WizardState | undefined>(undefined);

export function WizardProvider({ projectId, initialFileInfo, children }: { projectId: string; initialFileInfo?: WizardFileInfo; children: ReactNode }) {
  const [fileInfo, setFileInfo] = useState<WizardFileInfo | undefined>(initialFileInfo);
  const [dataset, setDataset] = useState<WizardDataset | undefined>();
  const [importDataset, setImportDataset] = useState<WizardDataset | undefined>();
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<number[]>([]);
  const [heightSource, setHeightSource] = useState<HeightSource>({
    type: 'none',
    status: 'not_detected',
    message: 'No height data detected'
  });
  const [targetSrid, setTargetSrid] = useState<number>(4326);

  // Override setTargetSrid to always set 4326
  const setTargetSridFixed = () => setTargetSrid(4326);

  return (
    <WizardContext.Provider value={{
      projectId,
      fileInfo, setFileInfo,
      dataset, setDataset,
      importDataset, setImportDataset,
      selectedFeatureIds, setSelectedFeatureIds,
      heightSource, setHeightSource,
      targetSrid,
      setTargetSrid: setTargetSridFixed,
    }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used within a WizardProvider');
  return ctx;
} 
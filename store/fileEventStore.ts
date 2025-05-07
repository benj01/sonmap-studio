import { create } from 'zustand';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'fileEventStore';

export interface FileEvent {
  type: 'delete' | 'add' | 'update';
  fileId: string;
  timestamp: number;
}

interface FileEventState {
  lastEvent: FileEvent | null;
  emitFileEvent: (event: Omit<FileEvent, 'timestamp'>) => void;
}

export const useFileEventStore = create<FileEventState>()((set) => ({
  lastEvent: null,
  emitFileEvent: (event) => {
    const fullEvent = {
      ...event,
      timestamp: Date.now()
    };
    // Await async logger and provide structured context
    dbLogger.debug('File event emitted', { event: fullEvent, source: SOURCE }).catch(() => {});
    set({ lastEvent: fullEvent });
  }
})); 
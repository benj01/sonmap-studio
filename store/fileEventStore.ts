import { create } from 'zustand';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'fileEventStore';

export interface FileEvent {
  type: 'delete' | 'add' | 'update';
  fileId: string;
  timestamp: number;
}

export interface FileEventState {
  lastEvent: FileEvent | null;
  emitFileEvent: (event: Omit<FileEvent, 'timestamp'>) => void;
}

export const useFileEventStore = create<FileEventState>()((set) => ({
  lastEvent: null,
  emitFileEvent: async (event) => {
    const fullEvent = {
      ...event,
      timestamp: Date.now()
    };
    await dbLogger.debug('File event emitted', { event: fullEvent }, { source: SOURCE });
    set({ lastEvent: fullEvent });
  }
})); 
import { create } from 'zustand';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'fileEventStore';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

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
    logger.debug('File event emitted', { event: fullEvent });
    set({ lastEvent: fullEvent });
  }
})); 
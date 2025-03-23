import { create } from 'zustand';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'verificationStore';
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

export interface VerificationStatus {
  status: 'pending' | 'in_progress' | 'verified' | 'failed';
  lastChecked: number;
  error?: string;
}

interface VerificationStore {
  // State
  status: Record<string, VerificationStatus>;
  pending: string[];
  inProgress: string[];
  lastVerified: Record<string, number>;
  
  // Actions
  setVerificationStatus: (layerId: string, status: VerificationStatus['status'], error?: string) => void;
  addToPending: (layerId: string) => void;
  removeFromPending: (layerId: string) => void;
  addToInProgress: (layerId: string) => void;
  removeFromInProgress: (layerId: string) => void;
  updateLastVerified: (layerId: string) => void;
  reset: () => void;
}

export const useVerificationStore = create<VerificationStore>()((set) => ({
  // Initial state
  status: {},
  pending: [],
  inProgress: [],
  lastVerified: {},

  // Actions
  setVerificationStatus: (layerId, status, error) => {
    set((state) => {
      const now = Date.now();
      const newStatus = {
        status,
        lastChecked: now,
        error
      };

      // Update status
      const updatedStatus = {
        ...state.status,
        [layerId]: newStatus
      };

      // Update lastVerified if status is verified
      const updatedLastVerified = {
        ...state.lastVerified,
        [layerId]: status === 'verified' ? now : state.lastVerified[layerId]
      };

      logger.debug('Verification status updated', { layerId, status, error });
      return {
        status: updatedStatus,
        lastVerified: updatedLastVerified
      };
    });
  },

  addToPending: (layerId) => {
    set((state) => {
      if (state.pending.includes(layerId)) return state;
      
      const updatedPending = [...state.pending, layerId];
      logger.debug('Layer added to pending verification', { layerId });
      return { pending: updatedPending };
    });
  },

  removeFromPending: (layerId) => {
    set((state) => {
      const updatedPending = state.pending.filter(id => id !== layerId);
      logger.debug('Layer removed from pending verification', { layerId });
      return { pending: updatedPending };
    });
  },

  addToInProgress: (layerId) => {
    set((state) => {
      if (state.inProgress.includes(layerId)) return state;
      
      const updatedInProgress = [...state.inProgress, layerId];
      logger.debug('Layer added to in-progress verification', { layerId });
      return { inProgress: updatedInProgress };
    });
  },

  removeFromInProgress: (layerId) => {
    set((state) => {
      const updatedInProgress = state.inProgress.filter(id => id !== layerId);
      logger.debug('Layer removed from in-progress verification', { layerId });
      return { inProgress: updatedInProgress };
    });
  },

  updateLastVerified: (layerId) => {
    set((state) => {
      const now = Date.now();
      const updatedLastVerified = {
        ...state.lastVerified,
        [layerId]: now
      };
      logger.debug('Last verified timestamp updated', { layerId, timestamp: now });
      return { lastVerified: updatedLastVerified };
    });
  },

  reset: () => {
    set({
      status: {},
      pending: [],
      inProgress: [],
      lastVerified: {}
    });
    logger.info('Verification store reset');
  }
})); 
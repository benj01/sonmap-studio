// MIGRATION: Logger usage migrated to async/await dbLogger. Legacy LogManager and inline logger removed.
// See debug.mdc and cursor_rules.mdc for migration details.

import { create } from 'zustand';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'verificationStore';

export interface VerificationStatus {
  status: 'pending' | 'in_progress' | 'verified' | 'failed';
  lastChecked: number;
  error?: string;
}

interface NormalizedVerificationState {
  status: Record<string, VerificationStatus>;
  pending: string[];
  inProgress: string[];
  lastVerified: Record<string, number>;
}

interface VerificationStore {
  // State
  verification: NormalizedVerificationState;
  
  // Actions
  setVerificationStatus: (layerId: string, status: VerificationStatus['status'], error?: string) => void;
  addToPending: (layerId: string) => void;
  removeFromPending: (layerId: string) => void;
  addToInProgress: (layerId: string) => void;
  removeFromInProgress: (layerId: string) => void;
  updateLastVerified: (layerId: string) => void;
  reset: () => void;
}

const initialState: NormalizedVerificationState = {
  status: {},
  pending: [],
  inProgress: [],
  lastVerified: {}
};

export const useVerificationStore = create<VerificationStore>()((set) => ({
  // Initial state
  verification: initialState,

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
        ...state.verification.status,
        [layerId]: newStatus
      };

      // Update lastVerified if status is verified
      const updatedLastVerified = {
        ...state.verification.lastVerified,
        [layerId]: status === 'verified' ? now : state.verification.lastVerified[layerId]
      };

      (async () => {
        await dbLogger.debug('Verification status updated', { layerId, status, error }, { source: SOURCE });
      })();
      return {
        verification: {
          ...state.verification,
          status: updatedStatus,
          lastVerified: updatedLastVerified
        }
      };
    });
  },

  addToPending: (layerId) => {
    set((state) => {
      if (state.verification.pending.includes(layerId)) return state;
      
      const updatedPending = [...state.verification.pending, layerId];
      (async () => {
        await dbLogger.debug('Layer added to pending verification', { layerId }, { source: SOURCE });
      })();
      return {
        verification: {
          ...state.verification,
          pending: updatedPending
        }
      };
    });
  },

  removeFromPending: (layerId) => {
    set((state) => {
      const updatedPending = state.verification.pending.filter(id => id !== layerId);
      (async () => {
        await dbLogger.debug('Layer removed from pending verification', { layerId }, { source: SOURCE });
      })();
      return {
        verification: {
          ...state.verification,
          pending: updatedPending
        }
      };
    });
  },

  addToInProgress: (layerId) => {
    set((state) => {
      if (state.verification.inProgress.includes(layerId)) return state;
      
      const updatedInProgress = [...state.verification.inProgress, layerId];
      (async () => {
        await dbLogger.debug('Layer added to in-progress verification', { layerId }, { source: SOURCE });
      })();
      return {
        verification: {
          ...state.verification,
          inProgress: updatedInProgress
        }
      };
    });
  },

  removeFromInProgress: (layerId) => {
    set((state) => {
      const updatedInProgress = state.verification.inProgress.filter(id => id !== layerId);
      (async () => {
        await dbLogger.debug('Layer removed from in-progress verification', { layerId }, { source: SOURCE });
      })();
      return {
        verification: {
          ...state.verification,
          inProgress: updatedInProgress
        }
      };
    });
  },

  updateLastVerified: (layerId) => {
    set((state) => {
      const now = Date.now();
      const updatedLastVerified = {
        ...state.verification.lastVerified,
        [layerId]: now
      };
      (async () => {
        await dbLogger.debug('Last verified timestamp updated', { layerId, timestamp: now }, { source: SOURCE });
      })();
      return {
        verification: {
          ...state.verification,
          lastVerified: updatedLastVerified
        }
      };
    });
  },

  reset: () => {
    set({ verification: initialState });
    (async () => {
      await dbLogger.info('Verification store reset', { action: 'reset' }, { source: SOURCE });
    })();
  }
}));

// Verification selectors
export const verificationSelectors = {
  // Get verification status for a layer
  getVerificationStatus: (state: VerificationStore) => (layerId: string) => {
    return state.verification.status[layerId];
  },

  // Get all pending verifications
  getPendingVerifications: (state: VerificationStore) => {
    return state.verification.pending;
  },

  // Get all in-progress verifications
  getInProgressVerifications: (state: VerificationStore) => {
    return state.verification.inProgress;
  },

  // Get last verified timestamp for a layer
  getLastVerified: (state: VerificationStore) => (layerId: string) => {
    return state.verification.lastVerified[layerId];
  },

  // Get layers that need verification (not verified recently)
  getLayersNeedingVerification: (state: VerificationStore) => (maxAge: number = 30000) => {
    const now = Date.now();
    return Object.entries(state.verification.lastVerified)
      .filter(([, timestamp]) => now - timestamp > maxAge)
      .map(([layerId]) => layerId);
  },

  // Get layers with verification errors
  getLayersWithVerificationErrors: (state: VerificationStore) => {
    return Object.entries(state.verification.status)
      .filter(([, status]) => status.error)
      .map(([layerId]) => layerId);
  }
};

// Custom hooks for verification operations
export const useVerificationStatus = (layerId: string) => {
  return useVerificationStore((state) => verificationSelectors.getVerificationStatus(state)(layerId));
};

export const usePendingVerifications = () => {
  return useVerificationStore(verificationSelectors.getPendingVerifications);
};

export const useInProgressVerifications = () => {
  return useVerificationStore(verificationSelectors.getInProgressVerifications);
};

export const useLastVerified = (layerId: string) => {
  return useVerificationStore((state) => verificationSelectors.getLastVerified(state)(layerId));
};

export const useLayersNeedingVerification = (maxAge: number = 30000) => {
  return useVerificationStore((state) => verificationSelectors.getLayersNeedingVerification(state)(maxAge));
};

export const useLayersWithVerificationErrors = () => {
  return useVerificationStore(verificationSelectors.getLayersWithVerificationErrors);
}; 
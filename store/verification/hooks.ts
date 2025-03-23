import { useCallback } from 'react';
import { useVerificationStore } from './verificationStore';
import { verificationSelectors } from './verificationStore';
import type { VerificationStatus } from './types';

// Single layer verification operations
export const useVerification = (layerId: string) => {
  const store = useVerificationStore();
  const status = useVerificationStore((state) => verificationSelectors.getVerificationStatus(state)(layerId));
  const lastVerified = useVerificationStore((state) => verificationSelectors.getLastVerified(state)(layerId));

  const setStatus = useCallback((status: VerificationStatus['status'], error?: string) => {
    store.setVerificationStatus(layerId, status, error);
  }, [layerId, store]);

  const addToPending = useCallback(() => {
    store.addToPending(layerId);
  }, [layerId, store]);

  const removeFromPending = useCallback(() => {
    store.removeFromPending(layerId);
  }, [layerId, store]);

  const addToInProgress = useCallback(() => {
    store.addToInProgress(layerId);
  }, [layerId, store]);

  const removeFromInProgress = useCallback(() => {
    store.removeFromInProgress(layerId);
  }, [layerId, store]);

  const updateLastVerified = useCallback(() => {
    store.updateLastVerified(layerId);
  }, [layerId, store]);

  return {
    status,
    lastVerified,
    setStatus,
    addToPending,
    removeFromPending,
    addToInProgress,
    removeFromInProgress,
    updateLastVerified
  };
};

// Bulk verification operations
export const useVerifications = () => {
  const store = useVerificationStore();
  const pendingVerifications = useVerificationStore(verificationSelectors.getPendingVerifications);
  const inProgressVerifications = useVerificationStore(verificationSelectors.getInProgressVerifications);
  const layersNeedingVerification = useVerificationStore((state) => verificationSelectors.getLayersNeedingVerification(state)(30000));
  const layersWithErrors = useVerificationStore(verificationSelectors.getLayersWithVerificationErrors);

  return {
    pendingVerifications,
    inProgressVerifications,
    layersNeedingVerification,
    layersWithErrors
  };
};

// Verification status operations
export const useVerificationStatus = (layerId: string) => {
  const store = useVerificationStore();
  const status = useVerificationStore((state) => verificationSelectors.getVerificationStatus(state)(layerId));

  const setStatus = useCallback((status: VerificationStatus['status'], error?: string) => {
    store.setVerificationStatus(layerId, status, error);
  }, [layerId, store]);

  return {
    status,
    setStatus
  };
};

// Verification queue operations
export const useVerificationQueue = () => {
  const store = useVerificationStore();
  const pendingVerifications = useVerificationStore(verificationSelectors.getPendingVerifications);
  const inProgressVerifications = useVerificationStore(verificationSelectors.getInProgressVerifications);

  const addToPending = useCallback((layerId: string) => {
    store.addToPending(layerId);
  }, [store]);

  const removeFromPending = useCallback((layerId: string) => {
    store.removeFromPending(layerId);
  }, [store]);

  const addToInProgress = useCallback((layerId: string) => {
    store.addToInProgress(layerId);
  }, [store]);

  const removeFromInProgress = useCallback((layerId: string) => {
    store.removeFromInProgress(layerId);
  }, [store]);

  return {
    pendingVerifications,
    inProgressVerifications,
    addToPending,
    removeFromPending,
    addToInProgress,
    removeFromInProgress
  };
}; 
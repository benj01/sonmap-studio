'use client';

import { useEffect } from 'react';
import { preloadCommonCoordinateSystems } from '@/lib/coordinate-systems';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CoordinateSystemsProvider');

export function CoordinateSystemsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Preload common coordinate systems on app initialization
    preloadCommonCoordinateSystems().catch(error => {
      logger.warn('Failed to preload coordinate systems', { error });
    });
  }, []);

  return <>{children}</>;
} 
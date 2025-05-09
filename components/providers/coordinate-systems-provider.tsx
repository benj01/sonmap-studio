'use client';

import { useEffect } from 'react';
import { preloadCommonCoordinateSystems } from '@/lib/coordinate-systems';
import { dbLogger } from '@/utils/logging/dbLogger';

const LOG_SOURCE = 'CoordinateSystemsProvider';

export function CoordinateSystemsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Create an async function to handle preloading and logging
    const initCoordinateSystems = async () => {
      try {
        await preloadCommonCoordinateSystems();
      } catch (error) {
        await dbLogger.warn('Failed to preload coordinate systems', { 
          source: LOG_SOURCE,
          error 
        });
      }
    };

    // Handle the promise
    initCoordinateSystems().catch(async (error) => {
      await dbLogger.error('Error in coordinate systems initialization', {
        source: LOG_SOURCE,
        error
      });
    });
  }, []);

  return <>{children}</>;
} 
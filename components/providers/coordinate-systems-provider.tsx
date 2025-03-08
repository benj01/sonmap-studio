'use client';

import { useEffect } from 'react';
import { preloadCommonCoordinateSystems } from '@/lib/coordinate-systems';

export function CoordinateSystemsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Preload common coordinate systems on app initialization
    preloadCommonCoordinateSystems().catch(error => {
      console.warn('Failed to preload coordinate systems:', error);
    });
  }, []);

  return <>{children}</>;
} 
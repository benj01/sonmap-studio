'use client';
import { useEffect } from 'react';
import { registerGlobalLogListener } from '@/store/logs/registerGlobalLogListener';
import { dbLogger } from '@/utils/logging/dbLogger';

export function LogListenerProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerGlobalLogListener();
    if (typeof window !== 'undefined') {
      (window as any).dbLogger = dbLogger;
    }
  }, []);
  return <>{children}</>;
} 
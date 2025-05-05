'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { ILogger } from './ILogger';
import { DefaultLogger } from './DefaultLogger';

/**
 * Create a default logger instance that uses the LogManager singleton
 * This instance will be used as the default value for the context
 */
const defaultLoggerInstance = new DefaultLogger();

/**
 * Create the Logger Context with the default logger instance
 */
const LoggerContext = createContext<ILogger>(defaultLoggerInstance);

/**
 * Custom hook to access the logger instance from the context
 * @returns The logger instance implementing ILogger
 */
export const useLogger = (): ILogger => useContext(LoggerContext);

/**
 * Provider component that makes the logger instance available to its children
 * @param props - Component props containing children to be wrapped
 * @returns A React component that provides the logger context
 */
export const LoggerProvider = ({ children }: { children: ReactNode }) => {
  // In the future, you could potentially swap out the logger implementation here
  // by creating a different instance or using a different implementation of ILogger
  return (
    <LoggerContext.Provider value={defaultLoggerInstance}>
      {children}
    </LoggerContext.Provider>
  );
}; 
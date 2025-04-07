'use client';

import React from 'react';
import { CesiumProvider } from '../../context/CesiumContext';
import { CesiumView } from './CesiumView';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CesiumViewWithProvider';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

export const CesiumViewWithProvider = React.memo(() => {
  logger.debug('CesiumViewWithProvider: Render');

  return (
    <CesiumProvider>
      <CesiumView />
    </CesiumProvider>
  );
});

CesiumViewWithProvider.displayName = 'CesiumViewWithProvider'; 
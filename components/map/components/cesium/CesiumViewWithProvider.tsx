'use client';

import React from 'react';
import { CesiumProvider } from '../../context/CesiumContext';
import { CesiumView } from './CesiumView';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'CesiumViewWithProvider';

export const CesiumViewWithProvider = React.memo(() => {
  React.useEffect(() => {
    (async () => {
      await dbLogger.debug('CesiumViewWithProvider: Render', { source: SOURCE });
    })();
  }, []);

  return (
    <CesiumProvider>
      <CesiumView />
    </CesiumProvider>
  );
});

CesiumViewWithProvider.displayName = 'CesiumViewWithProvider'; 
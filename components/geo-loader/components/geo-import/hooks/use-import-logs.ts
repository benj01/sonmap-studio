import { useState, useCallback, useRef } from 'react';
import { LogType } from '../types';

interface ImportLogs {
  logs: Array<{ message: string; type: LogType; timestamp: Date }>;
  hasErrors: boolean;
}

export function useImportLogs() {
  const [state, setState] = useState<ImportLogs>({
    logs: [],
    hasErrors: false
  });
  const processedLogsRef = useRef(new Set<string>());

  const addLogs = useCallback((newLogs: { message: string; type: LogType }[]) => {
    const timestamp = new Date();
    
    // Force immediate UI update for errors
    if (newLogs.some(log => log.type === 'error')) {
      console.log('[DEBUG] Processing error logs:', newLogs);
    }
    
    setState((prevState) => {
      const uniqueLogs = newLogs.filter(log => {
        const logId = `${log.type}:${log.message}`;
        const isDuplicate = processedLogsRef.current.has(logId);
        if (!isDuplicate) {
          processedLogsRef.current.add(logId);
          // Log non-duplicate messages for debugging
          console.log(`[DEBUG] New log: ${log.type.toUpperCase()} - ${log.message}`);
        }
        return !isDuplicate;
      });

      if (uniqueLogs.length === 0) {
        return prevState;
      }

      const updatedLogs = [
        ...prevState.logs,
        ...uniqueLogs.map(log => ({
          ...log,
          timestamp
        }))
      ];

      const hasErrors = prevState.hasErrors || uniqueLogs.some(log => log.type === 'error');

      // Force re-render on error state change
      if (hasErrors !== prevState.hasErrors) {
        console.log('[DEBUG] Error state changed:', hasErrors);
        setTimeout(() => {
          window.dispatchEvent(new Event('error-state-changed'));
        }, 0);
      }

      return {
        logs: updatedLogs,
        hasErrors
      };
    });
  }, []);

  const clearLogs = useCallback(() => {
    setState({
      logs: [],
      hasErrors: false
    });
    processedLogsRef.current.clear();
  }, []);

  const onWarning = useCallback((message: string) => {
    addLogs([{ message, type: 'warning' }]);
  }, [addLogs]);

  const onError = useCallback((message: string) => {
    addLogs([{ message, type: 'error' }]);
  }, [addLogs]);

  const onInfo = useCallback((message: string) => {
    addLogs([{ message, type: 'info' }]);
  }, [addLogs]);

  return {
    logs: state.logs,
    hasErrors: state.hasErrors,
    addLogs,
    clearLogs,
    onWarning,
    onError,
    onInfo
  };
}

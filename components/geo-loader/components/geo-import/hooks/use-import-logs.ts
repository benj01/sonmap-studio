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
    setState((prevState) => {
      const uniqueLogs = newLogs.filter(log => {
        const logId = `${log.type}:${log.message}`;
        if (processedLogsRef.current.has(logId)) {
          return false;
        }
        processedLogsRef.current.add(logId);
        return true;
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

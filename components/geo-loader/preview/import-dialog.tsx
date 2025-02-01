import { LogManager } from '../core/logging/log-manager';

export function ImportDialog({ /* ... existing props ... */ }) {
  // ... existing code ...

  const handleDownloadLogs = () => {
    const logger = LogManager.getInstance();
    const filename = `sonmap-logs-${new Date().toISOString()}.txt`;
    logger.downloadLogs(filename);
  };

  return (
    <div className="import-dialog">
      <div className="import-dialog-header">
        <h2>Import {filename}</h2>
        <button 
          onClick={handleDownloadLogs}
          className="download-logs-button"
          title="Download debug logs"
        >
          📥 Download Logs
        </button>
      </div>
      {/* ... rest of the dialog content ... */}
    </div>
  );
} 
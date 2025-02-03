import React from 'react';
import { LogManager } from '../../core/logging/log-manager';

interface ErrorDisplayProps {
  error: {
    message: string;
    type: 'error' | 'warning' | 'info';
    details?: string;
    timestamp?: Date;
  };
  onDismiss?: () => void;
  onRetry?: () => void;
  onDownloadLogs?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onDismiss,
  onRetry,
  onDownloadLogs
}) => {
  const logger = LogManager.getInstance();

  const getErrorIcon = () => {
    switch (error.type) {
      case 'error':
        return '⚠️';
      case 'warning':
        return '⚡';
      case 'info':
        return 'ℹ️';
      default:
        return '❌';
    }
  };

  const getErrorClass = () => {
    switch (error.type) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'error';
    }
  };

  const getErrorTitle = () => {
    switch (error.type) {
      case 'error':
        return 'Error';
      case 'warning':
        return 'Warning';
      case 'info':
        return 'Information';
      default:
        return 'Error';
    }
  };

  const getErrorSolution = () => {
    // Common error patterns and their solutions
    if (error.message.includes('No processor available')) {
      return (
        <div className="solution">
          <p>This could be because:</p>
          <ul>
            <li>The file format is not supported yet</li>
            <li>The file extension doesn't match its content</li>
            <li>Required companion files are missing (e.g., .dbf, .prj for Shapefiles)</li>
          </ul>
          <p>Try:</p>
          <ul>
            <li>Checking if all required files are included</li>
            <li>Verifying the file format is supported</li>
            <li>Converting the file to a supported format (Shapefile, GeoJSON)</li>
          </ul>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className={`error-display ${getErrorClass()}`}>
      <div className="error-header">
        <span className="error-icon">{getErrorIcon()}</span>
        <span className="error-title">{getErrorTitle()}</span>
        {onDismiss && (
          <button className="close-button" onClick={onDismiss}>
            ×
          </button>
        )}
      </div>
      
      <div className="error-content">
        <p className="error-message">{error.message}</p>
        {error.details && (
          <pre className="error-details">{error.details}</pre>
        )}
        {getErrorSolution()}
      </div>

      <div className="error-actions">
        {onRetry && (
          <button className="action-button retry" onClick={onRetry}>
            Try Again
          </button>
        )}
        {onDownloadLogs && (
          <button className="action-button logs" onClick={onDownloadLogs}>
            Download Logs
          </button>
        )}
      </div>

      <style jsx>{`
        .error-display {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          margin: 16px;
          max-width: 600px;
          overflow: hidden;
        }

        .error-display.error {
          border-left: 4px solid #dc3545;
        }

        .error-display.warning {
          border-left: 4px solid #ffc107;
        }

        .error-display.info {
          border-left: 4px solid #17a2b8;
        }

        .error-header {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: #f8f9fa;
          border-bottom: 1px solid #eee;
        }

        .error-icon {
          margin-right: 8px;
          font-size: 20px;
        }

        .error-title {
          font-weight: 600;
          flex-grow: 1;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0 4px;
          color: #666;
        }

        .close-button:hover {
          color: #333;
        }

        .error-content {
          padding: 16px;
        }

        .error-message {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #333;
        }

        .error-details {
          background: #f8f9fa;
          padding: 12px;
          border-radius: 4px;
          font-size: 12px;
          color: #666;
          white-space: pre-wrap;
          margin: 0 0 12px 0;
        }

        .solution {
          background: #f8f9fa;
          padding: 12px;
          border-radius: 4px;
          margin-top: 12px;
        }

        .solution p {
          margin: 0 0 8px 0;
          font-size: 14px;
        }

        .solution ul {
          margin: 0 0 12px 0;
          padding-left: 24px;
          font-size: 13px;
        }

        .solution li {
          margin-bottom: 4px;
        }

        .error-actions {
          display: flex;
          gap: 8px;
          padding: 16px;
          background: #f8f9fa;
          border-top: 1px solid #eee;
        }

        .action-button {
          padding: 8px 16px;
          border-radius: 4px;
          border: none;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .action-button.retry {
          background: #007bff;
          color: white;
        }

        .action-button.retry:hover {
          background: #0056b3;
        }

        .action-button.logs {
          background: #6c757d;
          color: white;
        }

        .action-button.logs:hover {
          background: #5a6268;
        }
      `}</style>
    </div>
  );
}; 
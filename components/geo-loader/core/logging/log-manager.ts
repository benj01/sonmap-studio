import { saveAs } from 'file-saver';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: any;
}

export class LogManager {
  private static instance: LogManager;
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 10000; // Prevent memory issues

  private constructor() {}

  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  private formatLogEntry(entry: LogEntry): string {
    const dataStr = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : '';
    return `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}${dataStr}\n`;
  }

  private addLog(level: LogLevel, source: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      data
    };

    // Add to memory buffer
    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift(); // Remove oldest log if buffer is full
    }

    // Also log to console
    const formattedMessage = this.formatLogEntry(entry);
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }
  }

  public debug(source: string, message: string, data?: any) {
    this.addLog(LogLevel.DEBUG, source, message, data);
  }

  public info(source: string, message: string, data?: any) {
    this.addLog(LogLevel.INFO, source, message, data);
  }

  public warn(source: string, message: string, data?: any) {
    this.addLog(LogLevel.WARN, source, message, data);
  }

  public error(source: string, message: string, data?: any) {
    this.addLog(LogLevel.ERROR, source, message, data);
  }

  public downloadLogs(filename: string = 'sonmap-logs.txt') {
    const logText = this.logs.map(entry => this.formatLogEntry(entry)).join('\n');
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, filename);
  }

  public clearLogs() {
    this.logs = [];
  }
} 
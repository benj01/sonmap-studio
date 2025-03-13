import { LogManager } from '@/core/logging/log-manager';
import { SupabaseClient } from '@supabase/supabase-js';

const SOURCE = 'ImportErrorHandler';
const logger = LogManager.getInstance();

export interface ImportError extends Error {
  code?: string;
  details?: any;
  hint?: string;
  batchIndex?: number;
  start?: number;
  end?: number;
}

export class ImportErrorHandler {
  constructor(private supabase: SupabaseClient) {}

  async handleStreamError(error: ImportError, importLogId: string): Promise<void> {
    logger.error('Import stream error', SOURCE, {
      error,
      importLogId,
      details: error.details,
      hint: error.hint,
      code: error.code
    });

    await this.updateImportLog(importLogId, {
      status: 'failed',
      metadata: {
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        batchIndex: error.batchIndex,
        start: error.start,
        end: error.end,
        stack: error.stack
      }
    });
  }

  async handleBatchError(error: ImportError, importLogId: string, batchInfo: {
    batchIndex: number;
    start: number;
    end: number;
  }): Promise<void> {
    logger.error('Batch import failed', SOURCE, {
      error,
      importLogId,
      ...batchInfo,
      details: error.details,
      hint: error.hint,
      code: error.code
    });

    await this.updateImportLog(importLogId, {
      status: 'failed',
      metadata: {
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        ...batchInfo
      }
    });
  }

  async handleAuthError(error: Error): Promise<void> {
    logger.error('Authentication failed', SOURCE, { error });
  }

  private async updateImportLog(importLogId: string, update: {
    status: string;
    metadata: Record<string, any>;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('realtime_import_logs')
      .update(update)
      .eq('id', importLogId);

    if (error) {
      logger.error('Failed to update import log', SOURCE, {
        error,
        importLogId,
        update
      });
    }
  }
} 
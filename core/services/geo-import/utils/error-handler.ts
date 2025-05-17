import { dbLogger } from '@/utils/logging/dbLogger';
import { SupabaseClient } from '@supabase/supabase-js';

const SOURCE = 'ImportErrorHandler';

export interface ImportError extends Error {
  code?: string;
  details?: unknown;
  hint?: string;
  batchIndex?: number;
  start?: number;
  end?: number;
}

export class ImportErrorHandler {
  constructor(private supabase: SupabaseClient) {}

  async handleStreamError(error: ImportError, importLogId: string): Promise<void> {
    await dbLogger.error('Import stream error', {
      error,
      importLogId,
      details: error.details,
      hint: error.hint,
      code: error.code
    }, { source: 'ImportErrorHandler', importLogId });

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
    await dbLogger.error('Batch import failed', {
      error,
      importLogId,
      ...batchInfo,
      details: error.details,
      hint: error.hint,
      code: error.code
    }, { source: 'ImportErrorHandler', importLogId });

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
    await dbLogger.error('Authentication failed', { error }, { source: 'ImportErrorHandler' });
  }

  private async updateImportLog(importLogId: string, update: {
    status: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('realtime_import_logs')
      .update(update)
      .eq('id', importLogId);

    if (error) {
      await dbLogger.error('Failed to update import log', {
        error,
        importLogId,
        update
      }, { source: 'ImportErrorHandler', importLogId });
    }
  }
} 
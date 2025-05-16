import { dbLogger } from '@/utils/logging/dbLogger';
import { SupabaseClient } from '@supabase/supabase-js';
import { ImportNotice } from '../types/index';

const SOURCE = 'ImportNoticeHandler';

export class NoticeHandler {
  constructor(private supabase: SupabaseClient) {}

  async processNotices(
    notices: ImportNotice[],
    context: {
      importLogId: string;
      batchIndex?: number;
    }
  ): Promise<void> {
    // Log notices based on level
    for (const notice of notices) {
      const logData = {
        importLogId: context.importLogId,
        batchIndex: context.batchIndex,
        notice
      };
      switch (notice.level) {
        case 'error':
          await dbLogger.error(notice.message, logData, { source: SOURCE });
          break;
        case 'warning':
          await dbLogger.warn(notice.message, logData, { source: SOURCE });
          break;
        case 'info':
          await dbLogger.info(notice.message, logData, { source: SOURCE });
          break;
        case 'debug':
          await dbLogger.debug(notice.message, logData, { source: SOURCE });
          break;
      }
    }

    // Update import log with notices
    const { error } = await this.supabase
      .from('realtime_import_logs')
      .update({
        metadata: {
          notices: notices,
          batch_index: context.batchIndex
        }
      })
      .eq('id', context.importLogId);

    if (error) {
      await dbLogger.error('Failed to update import log with notices', {
        error,
        importLogId: context.importLogId,
        batchIndex: context.batchIndex
      }, { source: SOURCE });
    }
  }

  async captureNotices<T>(
    rpcCall: () => Promise<{ data: T; error: unknown }>,
    context: { importLogId: string; batchIndex?: number }
  ): Promise<T> {
    try {
      // Execute the RPC call with notice capturing enabled
      const { data, error } = await rpcCall();

      if (error) {
        throw error;
      }

      // Check for notices in the response data
      if (
        data &&
        typeof data === 'object' &&
        'notices' in data &&
        Array.isArray((data as Record<string, unknown>).notices)
      ) {
        const notices = (data as Record<string, unknown>).notices as ImportNotice[];
        await this.processNotices(notices, context);
      }

      return data;
    } catch (e) {
      await dbLogger.error('Failed to capture notices', {
        error: e,
        context
      }, { source: SOURCE });
      throw e;
    }
  }
} 
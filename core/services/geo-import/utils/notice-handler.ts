import { LogManager } from '@/core/logging/log-manager';
import { SupabaseClient } from '@supabase/supabase-js';
import { ImportNotice } from '../types/index';

const SOURCE = 'ImportNoticeHandler';
const logger = LogManager.getInstance();

export class NoticeHandler {
  constructor(private supabase: SupabaseClient) {}

  async processNotices(notices: ImportNotice[], context: {
    importLogId: string;
    batchIndex?: number;
  }): Promise<void> {
    // Log notices based on level
    for (const notice of notices) {
      switch (notice.level) {
        case 'error':
          logger.error(notice.message, SOURCE, notice.details);
          break;
        case 'warning':
          logger.warn(notice.message, SOURCE, notice.details);
          break;
        case 'info':
          logger.info(notice.message, SOURCE, notice.details);
          break;
        case 'debug':
          logger.debug(notice.message, SOURCE, notice.details);
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
      logger.error('Failed to update import log with notices', SOURCE, {
        error,
        importLogId: context.importLogId
      });
    }
  }

  async captureNotices<T>(
    rpcCall: () => Promise<{ data: T; error: any }>,
    context: { importLogId: string; batchIndex?: number }
  ): Promise<T> {
    try {
      // Execute the RPC call with notice capturing enabled
      const { data, error } = await rpcCall();

      if (error) {
        throw error;
      }

      // Check for notices in the response data
      if (data && typeof data === 'object' && 'notices' in data) {
        const notices = (data as any).notices as ImportNotice[];
        if (Array.isArray(notices)) {
          await this.processNotices(notices, context);
        }
      }

      return data;
    } catch (e) {
      logger.error('Failed to capture notices', SOURCE, {
        error: e,
        context
      });
      throw e;
    }
  }
} 
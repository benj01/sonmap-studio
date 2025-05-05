import { SupabaseClient } from '@supabase/supabase-js';
import { dbLogger } from '@/utils/logging/dbLogger';
import { StorageAdapter, ImportState } from '../types/index';

const CHECKPOINT_TABLE = 'import_checkpoints';

export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(private supabase: SupabaseClient) {}

  async saveCheckpoint(importId: string, state: ImportState): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(CHECKPOINT_TABLE)
        .upsert({
          import_id: importId,
          state: state,
          updated_at: new Date().toISOString()
        });

      if (error) {
        await dbLogger.error('Failed to save checkpoint', { error }, { importId, state });
        throw error;
      }
      await dbLogger.info('Checkpoint saved', {}, { importId, state });
    } catch (error) {
      await dbLogger.error('Checkpoint save failed', { error }, { importId, state });
      throw error;
    }
  }

  async loadCheckpoint(importId: string): Promise<ImportState | null> {
    try {
      const { data, error } = await this.supabase
        .from(CHECKPOINT_TABLE)
        .select('state')
        .eq('import_id', importId)
        .single();

      if (error) {
        await dbLogger.error('Failed to load checkpoint', { error }, { importId });
        throw error;
      }
      await dbLogger.info('Checkpoint loaded', {}, { importId });
      return data?.state || null;
    } catch (error) {
      await dbLogger.error('Checkpoint load failed', { error }, { importId });
      throw error;
    }
  }

  async clearCheckpoint(importId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(CHECKPOINT_TABLE)
        .delete()
        .eq('import_id', importId);

      if (error) {
        await dbLogger.error('Failed to clear checkpoint', { error }, { importId });
        throw error;
      }
      await dbLogger.info('Checkpoint cleared', {}, { importId });
    } catch (error) {
      await dbLogger.error('Checkpoint clear failed', { error }, { importId });
      throw error;
    }
  }
} 
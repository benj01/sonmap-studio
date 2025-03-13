import { SupabaseClient } from '@supabase/supabase-js';
import { LogManager } from '@/core/logging/log-manager';
import { StorageAdapter, ImportState } from '../types/index';

const SOURCE = 'SupabaseStorageAdapter';
const CHECKPOINT_TABLE = 'import_checkpoints';

export class SupabaseStorageAdapter implements StorageAdapter {
  private logger = LogManager.getInstance();

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
        this.logger.error('Failed to save checkpoint', SOURCE, error);
        throw error;
      }
    } catch (error) {
      this.logger.error('Checkpoint save failed', SOURCE, error);
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
        this.logger.error('Failed to load checkpoint', SOURCE, error);
        throw error;
      }

      return data?.state || null;
    } catch (error) {
      this.logger.error('Checkpoint load failed', SOURCE, error);
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
        this.logger.error('Failed to clear checkpoint', SOURCE, error);
        throw error;
      }
    } catch (error) {
      this.logger.error('Checkpoint clear failed', SOURCE, error);
      throw error;
    }
  }
} 
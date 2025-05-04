import { createClient } from '@/utils/supabase/client';
import { dbLogger } from '@/utils/logging/dbLogger';

export const logImportError = async (importLogId: string, error: any, context: any = {}) => {
  const supabase = createClient();
  
  // Extract the basic error information
  let errorMessage = 'Unknown error occurred';
  let errorDetails = {};
  
  if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = {
      name: error.name,
      stack: error.stack?.split('\n')[0] || '',
      code: (error as any).code,
    };
  } else if (typeof error === 'object' && error !== null) {
    errorMessage = String(error.message || error);
    errorDetails = { ...error };
  } else {
    errorMessage = String(error);
  }
  
  // Log to dbLogger for immediate visibility
  await dbLogger.error('Import Error', { importLogId, errorMessage, errorDetails }, context);
  
  // Update the realtime_import_logs table
  try {
    const { error: updateError } = await supabase
      .from('realtime_import_logs')
      .update({
        status: 'failed',
        metadata: {
          error: errorMessage,
          details: errorDetails,
          timestamp: new Date().toISOString()
        }
      })
      .eq('id', importLogId);
      
    if (updateError) {
      await dbLogger.error('Failed to update import log', { updateError, importLogId }, context);
    }
  } catch (logError) {
    await dbLogger.error('Error logging to database', { logError, importLogId }, context);
  }
}; 
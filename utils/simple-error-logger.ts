import { createClient } from '@/utils/supabase/client';

export const logImportError = async (importLogId: string, error: any) => {
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
  
  // Log to console for immediate visibility
  console.error(`Import Error (${importLogId}):`, errorMessage, errorDetails);
  
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
      console.error('Failed to update import log:', updateError);
    }
  } catch (logError) {
    console.error('Error logging to database:', logError);
  }
}; 
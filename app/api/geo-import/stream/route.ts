import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { ImportService } from '@/core/services/geo-import/import-service';
import { SupabaseImportAdapter } from '@/core/services/geo-import/adapters/supabase-import-adapter';
import { SupabaseStorageAdapter } from '@/core/services/geo-import/adapters/supabase-storage-adapter';
import { SupabaseMetricsAdapter } from '@/core/services/geo-import/adapters/supabase-metrics-adapter';
import { logImportError } from '@/utils/simple-error-logger';

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (jsonError) {
    console.error('Invalid JSON in request body:', jsonError);
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }
  
  const { projectFileId, importLogId, collectionName, features, sourceSrid, targetSrid, batchSize } = requestBody;
  
  // Basic validation
  if (!projectFileId || !features || !Array.isArray(features) || !collectionName) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    );
  }
  
  try {
    const importService = new ImportService(
      new SupabaseImportAdapter(supabase),
      new SupabaseStorageAdapter(supabase),
      new SupabaseMetricsAdapter(supabase),
      {
        defaultBatchSize: batchSize || 100,
        defaultTargetSrid: targetSrid || 4326,
        maxRetries: 3,
        retryDelay: 1000,
        checkpointInterval: 5000
      }
    );

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start the import process
    importService.streamFeatures({
      projectFileId,
      collectionName,
      features,
      sourceSrid,
      targetSrid,
      batchSize,
      onProgress: async (progress) => {
        try {
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'progress',
                ...progress
              }) + '\n'
            )
          );
        } catch (writeError) {
          console.error('Failed to write progress:', writeError);
        }
      },
      onError: async (error) => {
        try {
          await logImportError(importLogId, error);
          await writer.write(
            encoder.encode(JSON.stringify({
              type: 'error',
              error: {
                message: error.message || 'Unknown error occurred',
                code: 'STREAM_ERROR'
              }
            }) + '\n')
          );
          await writer.close();
        } catch (writeError) {
          console.error('Failed to write error to stream:', writeError);
        }
      }
    });

    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    await logImportError(importLogId, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
import { NextResponse } from 'next/server';
import { dbLogger } from '@/utils/logging/dbLogger';

export async function POST(request: Request) {
  try {
    const { fileName, projectId } = await request.json();

    if (!fileName) {
      return NextResponse.json(
        { error: 'fileName is required' },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    // Call the Edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined');
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-s3-credentials`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ fileName, projectId }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    await dbLogger.error('Error in get-s3-credentials route', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      // Optionally add fileName, projectId if available in scope
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

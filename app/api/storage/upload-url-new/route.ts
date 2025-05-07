import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { dbLogger } from '@/utils/logging/dbLogger';
import { v4 as uuidv4 } from 'uuid';
import type { User, PostgrestError } from '@supabase/supabase-js';
import type { AuthError } from '@supabase/auth-js';
import type { StorageError } from '@supabase/storage-js';

const SOURCE = 'UploadUrlEndpoint';

interface UploadUrlRequestBody {
  filename: string;
  projectId: string;
  contentType?: string;
}

export async function POST(request: Request) {
  const requestId = uuidv4();
  let userId: string | undefined = undefined;
  let projectId: string | undefined = undefined;
  let filename: string | undefined = undefined;
  try {
    await dbLogger.info('Starting upload-url endpoint', { SOURCE, requestId });
    // Get auth token from request header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      await dbLogger.warn('No authorization header present', { SOURCE, requestId });
      return NextResponse.json(
        { error: 'Unauthorized - No authorization header' },
        { status: 401 }
      );
    }

    const body: UploadUrlRequestBody = await request.json();
    filename = body.filename;
    projectId = body.projectId;
    const contentType = body.contentType;

    await dbLogger.info('Upload URL request', { SOURCE, requestId, filename, projectId, contentType });

    if (!filename || !projectId) {
      await dbLogger.warn('Missing required parameters', { SOURCE, requestId, filename, projectId });
      return NextResponse.json(
        { error: 'Filename and projectId are required' },
        { status: 400 }
      );
    }

    // Create Supabase client with auth context
    await dbLogger.info('Creating Supabase client...', { SOURCE, requestId });
    const token = authHeader.replace('Bearer ', '');
    const supabase = await createClient();

    // Verify user authentication
    const userResponse: { data: { user: User | null }; error: AuthError | null } = await supabase.auth.getUser(token);
    const { data: { user }, error: authError } = userResponse;
    if (authError) {
      await dbLogger.error('Auth error', { SOURCE, requestId, error: authError, token: token.substring(0, 10) + '...' });
      return NextResponse.json(
        { error: 'Authentication failed: ' + authError.message },
        { status: 401 }
      );
    }
    if (!user) {
      await dbLogger.error('No user found with token', { SOURCE, requestId, token: token.substring(0, 10) + '...' });
      return NextResponse.json(
        { error: 'No authenticated user found' },
        { status: 401 }
      );
    }
    userId = user.id;
    await dbLogger.info('User authenticated', { SOURCE, requestId, userId });

    // Verify project access
    const { data: project, error: projectError }: { data: { id: string; owner_id: string } | null; error: PostgrestError | null } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single();

    if (projectError) {
      await dbLogger.error('Project access check failed', { 
        SOURCE,
        requestId,
        error: projectError,
        userId,
        projectId
      });
      return NextResponse.json(
        { error: 'Project access check failed: ' + projectError.message },
        { status: 403 }
      );
    }

    if (!project) {
      await dbLogger.warn('Project not found', { SOURCE, requestId, projectId });
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Verify project ownership
    if (project.owner_id !== user.id) {
      await dbLogger.warn('User does not own project', { 
        SOURCE,
        requestId,
        userId,
        projectId,
        ownerId: project.owner_id
      });
      return NextResponse.json(
        { error: 'You do not have permission to upload files to this project' },
        { status: 403 }
      );
    }

    await dbLogger.info('Project access verified', { SOURCE, requestId, projectId, userId });

    // Create the full storage path including user ID
    const storagePath = `${user.id}/${projectId}/${filename}`;
    await dbLogger.info('Storage path constructed', { SOURCE, requestId, storagePath });

    // Create a signed URL for uploading
    await dbLogger.info('Creating signed upload URL...', { SOURCE, requestId });
    const uploadUrlResponse: { data: { signedUrl: string; token: string; path: string } | null; error: StorageError | null } = await supabase.storage
      .from('project-files')
      .createSignedUploadUrl(storagePath, {
        upsert: true
      });

    const { data: uploadData, error: signedUrlError } = uploadUrlResponse;

    if (signedUrlError) {
      await dbLogger.error('Failed to create signed URL', {
        SOURCE,
        requestId,
        error: signedUrlError,
        path: storagePath,
        userId,
        projectId,
        contentType
      });
      return NextResponse.json(
        { error: 'Failed to create upload URL: ' + signedUrlError.message },
        { status: 500 }
      );
    }

    if (!uploadData?.signedUrl) {
      await dbLogger.error('No signed URL in response', { SOURCE, requestId, uploadData });
      return NextResponse.json(
        { error: 'No signed URL received from storage service' },
        { status: 500 }
      );
    }

    await dbLogger.info('Successfully created signed URL', {
      SOURCE,
      requestId,
      path: storagePath,
      contentType,
      expiresIn: '10 minutes'
    });
    
    return NextResponse.json({
      data: {
        signedUrl: uploadData.signedUrl,
        path: storagePath
      }
    });
  } catch (error) {
    await dbLogger.error('Unexpected error in upload-url route', {
      SOURCE,
      requestId,
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      projectId,
      filename
    });
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
} 
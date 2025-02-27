import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'UploadUrlEndpoint';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    console.info(`[${SOURCE}] ${message}`, data);
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    console.warn(`[${SOURCE}] ${message}`, error);
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    console.error(`[${SOURCE}] ${message}`, error);
    logManager.error(SOURCE, message, error);
  }
};

export async function POST(request: Request) {
  logger.info('Starting upload-url endpoint');
  
  try {
    // Get auth token from request header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      logger.warn('No authorization header present');
      return NextResponse.json(
        { error: 'Unauthorized - No authorization header' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { filename, projectId, contentType } = body;

    logger.info('Upload URL request', { filename, projectId, contentType });

    if (!filename || !projectId) {
      logger.warn('Missing required parameters', { filename, projectId });
      return NextResponse.json(
        { error: 'Filename and projectId are required' },
        { status: 400 }
      );
    }

    // Create Supabase client with auth context
    logger.info('Creating Supabase client...');
    const token = authHeader.replace('Bearer ', '');
    const supabase = await createClient();

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      logger.error('Auth error', { error: authError, token: token.substring(0, 10) + '...' });
      return NextResponse.json(
        { error: 'Authentication failed: ' + authError.message },
        { status: 401 }
      );
    }
    if (!user) {
      logger.error('No user found with token', { token: token.substring(0, 10) + '...' });
      return NextResponse.json(
        { error: 'No authenticated user found' },
        { status: 401 }
      );
    }
    logger.info('User authenticated', { userId: user.id });

    // Verify project access
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single();

    if (projectError) {
      logger.error('Project access check failed', { 
        error: projectError,
        userId: user.id,
        projectId
      });
      return NextResponse.json(
        { error: 'Project access check failed: ' + projectError.message },
        { status: 403 }
      );
    }

    if (!project) {
      logger.warn('Project not found', { projectId });
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Verify project ownership
    if (project.owner_id !== user.id) {
      logger.warn('User does not own project', { 
        userId: user.id,
        projectId,
        ownerId: project.owner_id
      });
      return NextResponse.json(
        { error: 'You do not have permission to upload files to this project' },
        { status: 403 }
      );
    }

    logger.info('Project access verified', { projectId, userId: user.id });

    // Create the full storage path including user ID
    const storagePath = `${user.id}/${projectId}/${filename}`;
    logger.info('Storage path constructed', { storagePath });

    // Create a signed URL for uploading
    logger.info('Creating signed upload URL...');
    const { data: uploadData, error: signedUrlError } = await supabase.storage
      .from('project-files')
      .createSignedUploadUrl(storagePath, {
        upsert: true,
        contentType: contentType || 'application/octet-stream'
      });

    if (signedUrlError) {
      logger.error('Failed to create signed URL', {
        error: signedUrlError,
        path: storagePath,
        userId: user.id,
        projectId,
        contentType
      });

      return NextResponse.json(
        { error: 'Failed to create upload URL: ' + signedUrlError.message },
        { status: 500 }
      );
    }

    if (!uploadData?.signedUrl) {
      logger.error('No signed URL in response', { uploadData });
      return NextResponse.json(
        { error: 'No signed URL received from storage service' },
        { status: 500 }
      );
    }

    logger.info('Successfully created signed URL', {
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
    logger.error('Unexpected error in upload-url route', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
} 
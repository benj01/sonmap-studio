import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'UploadUrlEndpoint';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
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
        { error: 'Unauthorized' },
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
    if (authError || !user) {
      logger.error('Invalid auth token', { error: authError, token: token.substring(0, 10) + '...' });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    logger.info('User authenticated', { userId: user.id });

    // Verify project access
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (projectError) {
      logger.error('Project access check failed', { 
        error: projectError,
        userId: user.id,
        projectId
      });
      return NextResponse.json(
        { error: 'Project access check failed' },
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

    logger.info('Project access verified', { projectId, userId: user.id });

    // Create the full storage path including project ID
    const storagePath = `${projectId}/${filename}`;
    logger.info('Storage path', { storagePath });

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
        projectId
      });

      return NextResponse.json(
        { error: 'Failed to create upload URL: ' + signedUrlError.message },
        { status: 500 }
      );
    }

    if (!uploadData?.signedUrl) {
      logger.error('No signed URL in response', { uploadData });
      return NextResponse.json(
        { error: 'No signed URL received from storage' },
        { status: 500 }
      );
    }

    logger.info('Successfully created signed URL', {
      path: storagePath,
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
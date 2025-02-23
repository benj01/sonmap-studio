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

export async function GET(request: Request) {
  logger.info('Starting upload-url endpoint');
  
  try {
    logger.info('Parsing URL...');
    let url: URL;
    try {
      url = new URL(request.url);
    } catch (e) {
      logger.error('Failed to parse request URL', e);
      return NextResponse.json(
        { error: 'Invalid request URL' },
        { status: 400 }
      );
    }

    logger.info('Getting search params...');
    let searchParams: URLSearchParams;
    try {
      searchParams = url.searchParams;
    } catch (e) {
      logger.error('Failed to get search params', e);
      return NextResponse.json(
        { error: 'Invalid search parameters' },
        { status: 400 }
      );
    }

    logger.info('Extracting filename and projectId...');
    const filename = searchParams.get('filename');
    const projectId = searchParams.get('projectId');

    logger.info('Upload URL request', { filename, projectId });

    if (!filename || !projectId) {
      logger.warn('Missing required parameters', { filename, projectId });
      return NextResponse.json(
        { error: 'Filename and projectId are required' },
        { status: 400 }
      );
    }

    logger.info('Creating Supabase client...');
    let supabase;
    try {
      supabase = await createClient();
    } catch (e) {
      logger.error('Failed to create Supabase client', e);
      return NextResponse.json(
        { error: 'Failed to initialize storage client' },
        { status: 500 }
      );
    }
    logger.info('Supabase client created');

    // Create the full storage path including project ID
    const storagePath = `${projectId}/${filename}`;
    logger.info('Storage path', { storagePath });

    // Create a signed URL for uploading
    logger.info('Creating signed upload URL...');
    const { data: uploadData, error: signedUrlError } = await supabase.storage
      .from('project-files')
      .createSignedUploadUrl(storagePath);

    if (signedUrlError) {
      logger.error('Failed to create signed URL', {
        error: signedUrlError,
        data: uploadData
      });

      // Check if this is a permissions error
      if (signedUrlError.message?.includes('security policy')) {
        // First verify if the user has access to the project
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .single();

        if (projectError) {
          return NextResponse.json(
            { error: 'Not authorized to access this project' },
            { status: 403 }
          );
        }

        if (!project) {
          return NextResponse.json(
            { error: 'Project not found' },
            { status: 404 }
          );
        }
      }

      return NextResponse.json(
        { error: 'Failed to create upload URL: ' + signedUrlError.message },
        { status: 500 }
      );
    }

    if (!uploadData?.signedUrl) {
      return NextResponse.json(
        { error: 'No signed URL received from storage' },
        { status: 500 }
      );
    }

    logger.info('Successfully created signed URL');
    return NextResponse.json({
      data: {
        signedUrl: uploadData.signedUrl,
        path: storagePath
      }
    });
  } catch (error) {
    // Log the full error object
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
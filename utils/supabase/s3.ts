import { S3Client } from '@aws-sdk/client-s3';
import { createLogger } from '@/utils/logger';

const SOURCE = 'S3Utils';
const logger = createLogger(SOURCE);

export async function getSignedUploadUrl(fileName: string, projectId: string) {
  try {
    const response = await fetch('/api/get-s3-credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName, projectId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to get upload URL');
    }

    const data = await response.json();
    return data.signedUrl;
  } catch (error) {
    logger.error('Failed to get signed URL', { error, fileName, projectId });
    throw error;
  }
}

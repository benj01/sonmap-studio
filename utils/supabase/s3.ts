import { S3Client } from '@aws-sdk/client-s3';

export async function getSignedUploadUrl(fileName: string) {
  try {
    const response = await fetch('/api/get-s3-credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName }),
    });

    if (!response.ok) {
      throw new Error('Failed to get upload URL');
    }

    const data = await response.json();
    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw error;
  }
}
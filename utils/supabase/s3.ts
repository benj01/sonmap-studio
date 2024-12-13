import { S3Client } from '@aws-sdk/client-s3';
import { getSupabaseStorageS3Credentials } from './server'

export async function createS3Client() {
  const s3Creds = await getSupabaseStorageS3Credentials()

  if (!s3Creds) {
   throw new Error("Could not get S3 credentials")
  }
  
  const {endpoint, accessKeyId, secretAccessKey, region } = s3Creds
  
  return new S3Client({
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
    region: region,
    signatureVersion: 'v4',
  })
}
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function POST() {
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase.storage.getS3CredentialsForBucket('project-files');

    if (error) {
        console.error(error)
        return NextResponse.json({ error }, { status: 500 });
    }
    const { accessKey, secretKey, region, endpoint} = data

    return NextResponse.json({ accessKeyId: accessKey, secretAccessKey: secretKey, region, endpoint })
}
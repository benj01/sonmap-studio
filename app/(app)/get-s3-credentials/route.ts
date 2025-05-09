import { NextResponse } from 'next/server';
import createClient from '@/utils/supabase/server';
import { dbLogger } from '@/utils/logging/dbLogger';

export async function POST(req: Request) {
    try {
        const { fileName } = await req.json();
        const supabase = await createClient();

        const { data, error } = await supabase.storage
            .from('project-files')
            .createSignedUploadUrl(fileName);

        if (error) {
            await dbLogger.error('getS3Credentials.signedUrlError', { error });
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: unknown) {
        // Type guard for Error objects
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        await dbLogger.error('getS3Credentials.routeError', { error });
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

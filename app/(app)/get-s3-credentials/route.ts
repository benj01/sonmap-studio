import { NextResponse } from 'next/server';
import createClient from '@/utils/supabase/server';

export async function POST(req: Request) {
    try {
        const { fileName } = await req.json();
        const supabase = await createClient();

        const { data, error } = await supabase.storage
            .from('project-files')
            .createSignedUploadUrl(fileName);

        if (error) {
            console.error('Error getting signed URL:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in route handler:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

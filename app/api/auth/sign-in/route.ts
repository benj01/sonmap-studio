import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { dbLogger } from '@/utils/logging/dbLogger'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: Request) {
  const requestId = uuidv4()
  let email: string | undefined
  try {
    const formData: { email: string; password: string } = await request.json()
    email = formData.email
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    await dbLogger.info('auth.signIn.start', { email, requestId })
    const { data, error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    })

    if (error) {
      await dbLogger.error('auth.signIn.error', { email, requestId, error })
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    await dbLogger.info('auth.signIn.success', { email, requestId, userId: data.user?.id })
    return NextResponse.json(
      { user: data.user },
      { status: 200 }
    )
  } catch (error) {
    await dbLogger.error('auth.signIn.unhandled', { email, requestId, error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 
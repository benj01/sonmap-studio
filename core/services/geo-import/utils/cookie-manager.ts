import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'CookieManager';

export class CookieManager {
  private static instance: CookieManager;
  
  private constructor() {}

  static getInstance(): CookieManager {
    if (!CookieManager.instance) {
      CookieManager.instance = new CookieManager();
    }
    return CookieManager.instance;
  }

  async createClient(supabaseUrl: string, supabaseKey: string) {
    return createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          async get(name: string) {
            const cookieStore = await cookies();
            return cookieStore.get(name)?.value;
          },
          async set(name: string, value: string, options: CookieOptions) {
            try {
              const cookieStore = await cookies();
              cookieStore.set({ name, value, ...options });
            } catch (error) {
              await dbLogger.error('Failed to set cookie', { SOURCE, error, name });
            }
          },
          async remove(name: string, options: CookieOptions) {
            try {
              const cookieStore = await cookies();
              cookieStore.set({ name, value: '', ...options });
            } catch (error) {
              await dbLogger.error('Failed to remove cookie', { SOURCE, error, name });
            }
          },
        },
      }
    );
  }

  async getAuthCookie() {
    const cookieStore = await cookies();
    return cookieStore.get('sb-access-token')?.value;
  }

  async setAuthCookie(token: string, options: CookieOptions = {}) {
    try {
      const cookieStore = await cookies();
      cookieStore.set({
        name: 'sb-access-token',
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        ...options
      });
    } catch (error) {
      await dbLogger.error('Failed to set auth cookie', { SOURCE, error });
      throw error;
    }
  }

  async clearAuthCookie() {
    try {
      const cookieStore = await cookies();
      cookieStore.set({
        name: 'sb-access-token',
        value: '',
        expires: new Date(0),
        path: '/'
      });
    } catch (error) {
      await dbLogger.error('Failed to clear auth cookie', { SOURCE, error });
      throw error;
    }
  }
} 
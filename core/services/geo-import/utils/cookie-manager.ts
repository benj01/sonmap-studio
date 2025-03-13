import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

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
    const cookieStore = await cookies();

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
              // Handle edge cases where cookies cannot be set
              console.error('Failed to set cookie:', error);
            }
          },
          async remove(name: string, options: CookieOptions) {
            try {
              const cookieStore = await cookies();
              cookieStore.set({ name, value: '', ...options });
            } catch (error) {
              console.error('Failed to remove cookie:', error);
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
      console.error('Failed to set auth cookie:', error);
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
      console.error('Failed to clear auth cookie:', error);
      throw error;
    }
  }
} 
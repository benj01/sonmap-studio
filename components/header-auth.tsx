'use client'
import { signOutAction } from "@/app/actions";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import Link from "next/link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/client";
import { useState, useEffect } from 'react';

export default function HeaderAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setIsLoading(false);
      }
    };

    getUser();
  }, []);

  if (!hasEnvVars) {
    return (
      <div className="flex gap-4 items-center">
        <Badge variant="default" className="font-normal pointer-events-none">
          Please update .env.local file with anon key and url
        </Badge>
      </div>
    );
  }

  return (
    <>
      {isLoading ? ( 
        <div className="flex items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : user ? ( 
        <div className="flex items-center gap-4">
          <p>Hey, {user?.email}!</p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/profile" aria-label="View profile">Profile</Link>
            </Button>

            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                await signOutAction();
              } catch (error) {
                console.error('Sign out error:', error);
              }
            }}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                aria-label="Sign out of your account"
              >
                Sign out
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/sign-in" aria-label="Sign in to your account">Sign in</Link>
          </Button>
          <Button asChild size="sm" variant="default">
            <Link href="/sign-up" aria-label="Create a new account">Sign up</Link>
          </Button>
        </div>
      )}
    </>
  );
}

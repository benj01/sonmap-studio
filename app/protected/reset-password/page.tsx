'use client';

import { resetPasswordAction } from "@/app/actions";
import { FormMessage, type Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ResetPassword() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (searchParams) {
      const successMessage = searchParams.get('success');
      const errorMessage = searchParams.get('error');

      if (successMessage) {
        setMessage({ success: successMessage });
      } else if (errorMessage) {
        setMessage({ error: errorMessage });
      }
    }
  }, [searchParams]);

  return (
    <form action={resetPasswordAction as unknown as string} className="flex flex-col w-full max-w-md p-4 gap-2 [&>input]:mb-4">
      <h1 className="text-2xl font-medium">Reset password</h1>
      <p className="text-sm text-foreground/60">
        Please enter your new password below.
      </p>
      <Label htmlFor="password">New password</Label>
      <Input
        type="password"
        name="password"
        placeholder="New password"
        required
      />
      <Label htmlFor="confirmPassword">Confirm password</Label>
      <Input
        type="password"
        name="confirmPassword"
        placeholder="Confirm password"
        required
      />
      <SubmitButton>
        Reset password
      </SubmitButton>
      <FormMessage message={message} />
    </form>
  );
}

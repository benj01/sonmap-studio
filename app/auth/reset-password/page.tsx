'use client';

import { resetPasswordAction } from '@/app/actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';
import { FormMessage } from '@/components/form-message';
import { useState } from 'react';
import { formatMessage } from '@/utils/message';

export default function ResetPasswordPage() {
  const [message, setMessage] = useState<{ success?: string; error?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setIsSubmitting(true);
    setMessage(null);
    setFormError(null);

    try {
      const res = await resetPasswordAction(formData);
      const data = await res.json();

      if (data.kind === 'success') {
        setMessage({ success: data.message });
      } else {
        setFormError(data.error);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while processing your request.';
      setFormError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        await handleSubmit(formData);
      }}
      className="flex flex-col w-full max-w-md p-4 gap-2"
    >
      <h1 className="text-2xl font-medium">Reset Password</h1>
      <p className="text-sm text-foreground/60">Please enter your new password below.</p>
      <Label htmlFor="password">New password</Label>
      <Input type="password" name="password" placeholder="New password" required />
      <Label htmlFor="confirmPassword">Confirm password</Label>
      <Input type="password" name="confirmPassword" placeholder="Confirm password" required />
      <SubmitButton loading={isSubmitting} disabled={isSubmitting}>
        {isSubmitting ? 'Resetting password...' : 'Reset Password'}
      </SubmitButton>
      <FormMessage message={formatMessage(message, formError)} />
    </form>
  );
}

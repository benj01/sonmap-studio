'use client';

import { resetPasswordAction } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useSearchParams } from 'next/navigation';
import { formatMessage } from "@/utils/message";
import { type ActionResponse } from "@/types";
import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export type ExtendedMessage = FormMessageType & {
  success?: string;
  error?: string;
};

interface SubmitButtonProps {
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean; // Allow the `disabled` prop
}

export function SubmitButton({ 
  loading = false, 
  children, 
  className = '',
  disabled = false
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={disabled}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        children
      )}
    </Button>
  );
}

type FormMessageProps = {
  message?: string | { success?: string; error?: string } | null;
};

export function FormMessage({ message }: FormMessageProps) {
  if (!message) return null;

  if (typeof message === "string") {
    return <p>{message}</p>;
  }

  return (
    <div>
      {message.success && <p className="text-success">{message.success}</p>}
      {message.error && <p className="text-error">{message.error}</p>}
    </div>
  );
}

export default function ResetPassword() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<ExtendedMessage | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (formData: FormData) => {
    setIsSubmitting(true);
    setMessage(null);
    setFormError(null);

    try {
      const res = await resetPasswordAction(formData);
      const data = await res.json() as ActionResponse;

      if (data.kind === "success") {
        setMessage({ success: data.message });
      } else {
        setFormError(data.error);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : "An unexpected error occurred while processing your request.";
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
      className="flex flex-col w-full max-w-md p-4 gap-2 [&>input]:mb-4"
    >
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
      <SubmitButton loading={isSubmitting} disabled={isSubmitting}>
        {isSubmitting ? "Resetting password..." : "Reset password"}
      </SubmitButton>
      <FormMessage message={formatMessage(message, formError)} />
    </form>
  );
}

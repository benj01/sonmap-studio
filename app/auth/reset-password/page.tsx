"use client";

import { resetPasswordAction } from "@/app/actions";
import { FormMessage, type Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMessage } from "@/utils/message";

// Import ActionResponse type from actions
type ActionResponse<T = unknown> = {
  success: true;
  message: string;
  data?: T;
} | {
  error: string;
  code?: string;
};

export default function ResetPassword() {
  const router = useRouter();
  const [message, setMessage] = useState<Message | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setIsSubmitting(true);
    try {
      const res = await resetPasswordAction(formData);
      const data = await res.json() as ActionResponse;

      if ('success' in data && data.success) {
        setMessage({ success: data.message });
        setTimeout(() => {
          setMessage(null);
          setFormError(null);
          router.push('/sign-in');
        }, 3000);
      } else if ('error' in data) {
        setFormError(data.error);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setFormError(error.message || "An unexpected error occurred.");
      } else {
        setFormError("An unknown error occurred");
      }
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
      <SubmitButton disabled={isSubmitting}>
        {isSubmitting ? "Resetting password..." : "Reset password"}
      </SubmitButton>
      
      <FormMessage message={formatMessage(message, formError)} />
      
      {/* Screen reader announcement */}
      {formError && (
        <div aria-live="assertive" className="sr-only">
          {formError}
        </div>
      )}
      
      {/* Visual error display */}
      {formError && (
        <div role="alert" className="text-red-500">
          {formError}
        </div>
      )}
    </form>
  );
}

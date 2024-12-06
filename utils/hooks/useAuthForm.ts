import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Message } from '@/types/auth';
import { formatMessage } from '@/utils/message';

export function useAuthForm() {
  const [message, setMessage] = useState<Message | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams) {
      const successMessage = searchParams.get('success');
      const errorMessage = searchParams.get('error');
      const messageParam = searchParams.get('message');

      if (successMessage) {
        setMessage({ success: successMessage });
      } else if (errorMessage) {
        setMessage({ error: errorMessage });
      } else if (messageParam) {
        setMessage({ message: messageParam });
      }
    }
  }, [searchParams]);

  const handleFormSubmit = async (
    action: (formData: FormData) => Promise<Response>,
    formData: FormData
  ) => {
    setIsSubmitting(true);
    setMessage(null);
    setFormError(null);

    try {
      const res = await action(formData);
      const data = await res.json();

      if (data.kind === "success") {
        setMessage({ success: data.message });
        return { success: true, data };
      } else {
        setFormError(data.error);
        return { success: false, error: data.error };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : "An unexpected error occurred while processing your request.";
      setFormError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    message,
    formError,
    isSubmitting,
    setMessage,
    setFormError,
    setIsSubmitting,
    handleFormSubmit,
    formattedMessage: formatMessage(message, formError),
  };
}

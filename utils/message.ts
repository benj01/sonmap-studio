import { type ResetPasswordMessage } from "@/app/protected/reset-password/page";

export function formatMessage(
  message: ResetPasswordMessage | null,
  formError: string | null
): string | undefined {
  if (formError) return formError;
  if (message?.success) return message.success;
  if (message?.error) return message.error;
  return undefined;
}

import React from "react";
import { type ResetPasswordMessage } from "@/app/protected/reset-password/page";

type FormMessageProps = {
  message?: string | ResetPasswordMessage | null;
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

import React from "react";

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

export default FormMessage;

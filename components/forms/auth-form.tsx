import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { AuthFormProps } from "@/types/forms";
import type { Message } from "@/types/auth";

export function AuthForm({
  title,
  subtitle,
  children,
  onSubmit,
  submitText,
  isSubmitting = false,
  className = "",
}: AuthFormProps & { message?: Message | null }) {
  return (
    <form
      onSubmit={onSubmit}
      className={`flex flex-col min-w-64 max-w-md gap-6 ${className}`}
    >
      <div>
        <h1 className="text-2xl font-medium">{title}</h1>
        {subtitle && (
          <p className="text-sm text-foreground/60">{subtitle}</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {children}

        <SubmitButton disabled={isSubmitting}>
          {isSubmitting ? `${submitText}...` : submitText}
        </SubmitButton>
      </div>
    </form>
  );
}

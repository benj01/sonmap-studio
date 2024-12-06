'use client';

import { forgotPasswordAction } from "@/app/actions";
import { AuthForm } from "@/components/forms/auth-form";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/form-message";
import Link from "next/link";
import { useAuthForm } from "@/utils/hooks/useAuthForm";
import { forgotPasswordSchema } from "@/utils/validation/auth";
import { SmtpMessage } from "../smtp-message";

export default function ForgotPassword() {
    const {
        message,
        formError,
        isSubmitting,
        handleFormSubmit,
        formattedMessage
    } = useAuthForm();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        // Validate form data
        const result = forgotPasswordSchema.safeParse({
            email: formData.get("email"),
        });

        if (!result.success) {
            const error = result.error.issues[0];
            return { success: false, error: error.message };
        }

        await handleFormSubmit(forgotPasswordAction, formData);
    };

    return (
        <>
            <AuthForm
                title="Reset Password"
                subtitle={
                    <p className="text-sm text-secondary-foreground">
                        Already have an account?{" "}
                        <Link className="text-primary underline" href="/sign-in">
                            Sign in
                        </Link>
                    </p>
                }
                onSubmit={handleSubmit}
                submitText="Reset Password"
                isSubmitting={isSubmitting}
                className="mx-auto"
            >
                <FormField
                    label="Email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                />

                <FormMessage message={formattedMessage} />
            </AuthForm>
            <SmtpMessage />
        </>
    );
}

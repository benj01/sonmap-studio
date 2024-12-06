'use client';

import { signInAction } from "@/app/actions";
import { AuthForm } from "@/components/forms/auth-form";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/form-message";
import Link from "next/link";
import { useAuthForm } from "@/utils/hooks/useAuthForm";
import { signInSchema } from "@/utils/validation/auth";

export default function Login() {
    const {
        message,
        formError,
        isSubmitting,
        handleFormSubmit,
        formattedMessage,
        setFormError
    } = useAuthForm();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        // Validate form data
        const result = signInSchema.safeParse({
            email: formData.get("email"),
            password: formData.get("password"),
        });

        if (!result.success) {
            const error = result.error.issues[0];
            setFormError(error.message);
            return;
        }

        await handleFormSubmit(signInAction, formData);
    };

    return (
        <AuthForm
            title="Sign in"
            subtitle={
                <p className="text-sm text-foreground">
                    Don't have an account?{" "}
                    <Link className="text-foreground font-medium underline" href="/sign-up">
                        Sign up
                    </Link>
                </p>
            }
            onSubmit={handleSubmit}
            submitText="Sign in"
            isSubmitting={isSubmitting}
        >
            <FormField
                label="Email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
            />
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <FormField
                        label="Password"
                        name="password"
                        type="password"
                        placeholder="Your password"
                        required
                    />
                    <Link
                        className="text-xs text-foreground underline"
                        href="/forgot-password"
                    >
                        Forgot Password?
                    </Link>
                </div>
            </div>

            <FormMessage message={formattedMessage} />
        </AuthForm>
    );
}

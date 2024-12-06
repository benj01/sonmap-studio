'use client';

import { signUpAction } from "@/app/actions";
import { AuthForm } from "@/components/forms/auth-form";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/form-message";
import Link from "next/link";
import { useAuthForm } from "@/utils/hooks/useAuthForm";
import { signUpSchema } from "@/utils/validation/auth";
import { SmtpMessage } from "../smtp-message";

export default function Signup() {
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
        const result = signUpSchema.safeParse({
            email: formData.get("email"),
            password: formData.get("password"),
            confirmPassword: formData.get("confirmPassword"),
        });

        if (!result.success) {
            const error = result.error.issues[0];
            setFormError(error.message);
            return;
        }

        await handleFormSubmit(signUpAction, formData);
    };

    return (
        <>
            <AuthForm
                title="Sign up"
                subtitle={
                    <p className="text-sm text-foreground">
                        Already have an account?{" "}
                        <Link className="text-primary font-medium underline" href="/sign-in">
                            Sign in
                        </Link>
                    </p>
                }
                onSubmit={handleSubmit}
                submitText="Sign up"
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
                <FormField
                    label="Password"
                    name="password"
                    type="password"
                    placeholder="Your password"
                    minLength={6}
                    required
                />
                <FormField
                    label="Confirm Password"
                    name="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    minLength={6}
                    required
                />

                <FormMessage message={formattedMessage} />
            </AuthForm>
            <SmtpMessage />
        </>
    );
}

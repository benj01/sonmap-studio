'use client';

import { signInAction } from "@/app/actions";
import { FormMessage, type Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { type ActionResponse, type ActionSuccessResponse } from "@/types";
import { formatMessage } from "@/utils/message";

export default function Login() {
    const [message, setMessage] = useState<Message | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const searchParams = useSearchParams();

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

    async function handleSubmit(formData: FormData) {
        setMessage(null);
        setFormError(null);

        try {
            const res = await signInAction(formData);
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
        }
    }

    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                await handleSubmit(formData);
            }}
            className="flex-1 flex flex-col min-w-64"
        >
            <h1 className="text-2xl font-medium">Sign in</h1>
            <p className="text-sm text-foreground">
                Don't have an account?{" "}
                <Link className="text-foreground font-medium underline" href="/sign-up">
                    Sign up
                </Link>
            </p>
            <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
                <Label htmlFor="email">Email</Label>
                <Input name="email" placeholder="you@example.com" required />
                <div className="flex justify-between items-center">
                    <Label htmlFor="password">Password</Label>
                    <Link
                        className="text-xs text-foreground underline"
                        href="/forgot-password"
                    >
                        Forgot Password?
                    </Link>
                </div>
                <Input
                    type="password"
                    name="password"
                    placeholder="Your password"
                    required
                />
                <SubmitButton>
                    Sign in
                </SubmitButton>

                <FormMessage message={formatMessage(message, formError)} />
            </div>
        </form>
    );
}

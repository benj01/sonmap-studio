'use client';

import { signUpAction } from "@/app/actions";
import { FormMessage, type Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { SmtpMessage } from "../smtp-message";
import { useState, useEffect } from "react";
import { useSearchParams } from 'next/navigation';
import { type ActionResponse } from "@/types";
import { formatMessage } from "@/utils/message";

export default function Signup() {
    const [message, setMessage] = useState<Message | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
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

    async function handleSubmit(formData: FormData) {
        setMessage(null);
        setFormError(null);

        try {
            const res = await signUpAction(formData);
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
        <>
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    await handleSubmit(formData);
                }}
                className="flex flex-col min-w-64 max-w-64 mx-auto"
            >
                <h1 className="text-2xl font-medium">Sign up</h1>
                <p className="text-sm text text-foreground">
                    Already have an account?{" "}
                    <Link className="text-primary font-medium underline" href="/sign-in">
                        Sign in
                    </Link>
                </p>
                <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
                    <Label htmlFor="email">Email</Label>
                    <Input name="email" placeholder="you@example.com" required />
                    <Label htmlFor="password">Password</Label>
                    <Input
                        type="password"
                        name="password"
                        placeholder="Your password"
                        minLength={6}
                        required
                    />
                    <SubmitButton>
                        Sign up
                    </SubmitButton>

                    <FormMessage message={formatMessage(message, formError)} />
                </div>
            </form>
            <SmtpMessage />
        </>
    );
}

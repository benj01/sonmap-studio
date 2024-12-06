'use client';

import { forgotPasswordAction } from "@/app/actions";
import { FormMessage, type Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { SmtpMessage } from "../smtp-message";
import { useState, useEffect } from "react";
import { useSearchParams } from 'next/navigation';
import { type ActionResponse } from "@/types";

export default function ForgotPassword() {
    const searchParams = useSearchParams();
    const [message, setMessage] = useState<Message | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

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
            const res = await forgotPasswordAction(formData);
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
                className="flex-1 flex flex-col w-full gap-2 text-foreground [&>input]:mb-6 min-w-64 max-w-64 mx-auto"
            >
                <div>
                    <h1 className="text-2xl font-medium">Reset Password</h1>
                    <p className="text-sm text-secondary-foreground">
                        Already have an account?{" "}
                        <Link className="text-primary underline" href="/sign-in">
                            Sign in
                        </Link>
                    </p>
                </div>
                <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
                    <Label htmlFor="email">Email</Label>
                    <Input name="email" placeholder="you@example.com" required />
                    
                    <SubmitButton>
                        Reset Password
                    </SubmitButton>

                    <FormMessage 
                        message={
                            message ? { 
                                success: message?.success || 
                                        message.error || 
                                        message.message || "" 
                            } : 
                            formError ? { error: formError } : 
                            { message: "" }
                        }
                    />
                </div>
            </form>
            <SmtpMessage />
        </>
    );
}

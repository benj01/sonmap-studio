"use server";

import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

// Define response types
type SuccessResponse<T = unknown> = { 
  success: true; 
  message: string;
  data?: T;
};

type ErrorResponse = { 
  error: string; 
  code?: string;
};

type ActionResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

// Helper functions for consistent responses
function errorResponse(message: string, code?: string): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: message, code });
}

function successResponse<T>(message: string, data?: T): NextResponse<SuccessResponse<T>> {
  return NextResponse.json({ success: true, message, ...(data && { data }) });
}

export const signUpAction = async (formData: FormData): Promise<NextResponse<ActionResponse>> => {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  if (!email || !password) {
    return errorResponse("Email and password are required");
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error('Sign up error:', error.message, error?.code);
    return errorResponse(error.message, error?.code);
  }

  return successResponse("Thanks for signing up! Please check your email for a verification link.");
};

export const signInAction = async (formData: FormData): Promise<NextResponse<ActionResponse<{ email: string }>>> => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const supabase = await createClient();

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Sign in error:', error.message, error?.code);
    return errorResponse(error.message, error?.code);
  }

  if (!data.user.email) {
    return errorResponse("User email not found");
  }

  return successResponse(
    "Signed in successfully",
    { email: data.user.email }
  );
};

export const forgotPasswordAction = async (formData: FormData): Promise<NextResponse<ActionResponse>> => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  if (!email) {
    return errorResponse("Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/auth/reset-password`,
  });

  if (error) {
    console.error('Password reset error:', error.message, error?.code);
    return errorResponse("Could not reset password", error?.code);
  }

  return successResponse("Check your email for a link to reset your password.");
};

export const resetPasswordAction = async (formData: FormData): Promise<NextResponse<ActionResponse>> => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return errorResponse("Password and confirm password are required");
  }

  if (password !== confirmPassword) {
    return errorResponse("Passwords do not match");
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    console.error('Password update error:', error.message, error?.code);
    return errorResponse("Password update failed", error?.code);
  }

  return successResponse("Password updated successfully");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
};

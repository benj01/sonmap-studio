import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface SubmitButtonProps {
  loading?: boolean; // Indicates loading state
  children: React.ReactNode; // Content inside the button
  className?: string; // Additional styles
  disabled?: boolean; // Disables the button
}

export function SubmitButton({
  loading = false,
  children,
  className = "",
  disabled = false,
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={disabled}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export default SubmitButton;

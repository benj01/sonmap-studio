import { type Message } from "@/components/form-message";

export function formatMessage(message: Message | null, formError: string | null): Message {
    if (message) {
        // Pick the first available non-empty field
        return { 
            success: message.success || 
                    message.error || 
                    message.message || "" 
        };
    } else if (formError) {
        return { error: formError };
    }
    return { message: "" };
}

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Message } from '@/types'
import { formatMessage } from '@/utils/message'
import { useAuthUI } from '@/lib/stores/auth'
import { useToast } from '@/components/ui/use-toast'

export function useAuthForm() {
  const [message, setMessage] = useState<Message | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { setError: setAuthError, resetError: resetAuthError } = useAuthUI()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams) {
      const successMessage = searchParams.get('success')
      const errorMessage = searchParams.get('error')
      const messageParam = searchParams.get('message')

      if (successMessage) {
        setMessage({ success: successMessage })
      } else if (errorMessage) {
        setMessage({ error: errorMessage })
      } else if (messageParam) {
        setMessage({ message: messageParam })
      }
    }
  }, [searchParams])

  const handleFormSubmit = async (
    action: (formData: FormData) => Promise<Response>,
    formData: FormData
  ) => {
    setIsSubmitting(true)
    setMessage(null)
    setFormError(null)
    resetAuthError()

    try {
      const res = await action(formData)
      const data = await res.json()

      if (data.kind === "success") {
        setMessage({ success: data.message })
        toast({
          title: 'Success',
          description: data.message,
        })
        return { success: true, data }
      } else {
        const errorMessage = data.error || "An unexpected error occurred"
        setFormError(errorMessage)
        setAuthError(errorMessage)
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
        return { success: false, error: errorMessage }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : "An unexpected error occurred while processing your request."
      
      setFormError(errorMessage)
      setAuthError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
      return { success: false, error: errorMessage }
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setMessage(null)
    setFormError(null)
    resetAuthError()
    setIsSubmitting(false)
  }

  return {
    message,
    formError,
    isSubmitting,
    setMessage,
    setFormError,
    setIsSubmitting,
    handleFormSubmit,
    resetForm,
    formattedMessage: formatMessage(message, formError),
  }
}
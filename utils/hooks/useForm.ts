import { useState, useCallback } from 'react'
import type { ActionResponse } from '@/types/store'

interface UseFormOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: string) => void
}

export function useForm<T = unknown>(options: UseFormOptions<T> = {}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (
      action: (formData: FormData) => Promise<ActionResponse<T>>,
      formData: FormData
    ) => {
      setIsSubmitting(true)
      setError(null)
      setMessage(null)

      try {
        const response = await action(formData)

        if (response.success) {
          setMessage(response.message || 'Success')
          options.onSuccess?.(response.data as T)
          return response
        } else {
          setError(response.error)
          options.onError?.(response.error)
          return response
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
        setError(errorMessage)
        options.onError?.(errorMessage)
        return {
          success: false as const,
          error: errorMessage
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [options]
  )

  return {
    isSubmitting,
    error,
    message,
    handleSubmit,
    setError,
    setMessage
  }
}
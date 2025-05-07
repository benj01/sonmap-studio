import { useState, useCallback } from 'react'
// import { useAuth } from '@/components/providers/auth-provider' // Removed unused import
import type { ActionResponse } from '@/types'

interface UseFormOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: string) => void
  resetOnSuccess?: boolean
}

export function useForm<T = unknown>(options: UseFormOptions<T> = {}) {
  // const { user } = useAuth() // Removed unused variable
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (action: (formData: FormData) => Promise<ActionResponse<T>>, formData: FormData) => {
      setIsSubmitting(true)
      setFormMessage(null)

      try {
        const response = await action(formData)

        if ('success' in response) {
          setFormMessage(response.message)
          options.onSuccess?.(response.data as T)
          if (options.resetOnSuccess) {
            formData.forEach((_, key) => formData.delete(key))
          }
          return response
        } else {
          options.onError?.(response.error)
          return response
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
        options.onError?.(errorMessage)
        return {
          error: errorMessage,
          code: 'UNKNOWN_ERROR'
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [options]
  )

  return {
    isSubmitting,
    formMessage,
    handleSubmit,
    setFormMessage
  }
}
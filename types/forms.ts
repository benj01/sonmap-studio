// /types/forms.ts

export type FormFieldProps = {
  label: string
  name: string
  type?: string
  placeholder?: string
  required?: boolean
  minLength?: number
  error?: string
 }
 
 export type FormWrapperProps = {
  children: React.ReactNode
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>
  className?: string
 }
 
 export type AuthFormProps = FormWrapperProps & {
  title: string
  subtitle?: React.ReactNode
  submitText: string
  isSubmitting?: boolean
 }
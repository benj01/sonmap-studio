import { ReactNode } from 'react';

export type FormFieldProps = {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  error?: string;
};

export type FormWrapperProps = {
  children: ReactNode;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  className?: string;
};

export type AuthFormProps = FormWrapperProps & {
  title: string;
  subtitle?: ReactNode;
  submitText: string;
  isSubmitting?: boolean;
};

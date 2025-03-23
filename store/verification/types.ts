export interface VerificationStatus {
  status: 'pending' | 'in_progress' | 'verified' | 'failed';
  lastChecked: number;
  error?: string;
} 
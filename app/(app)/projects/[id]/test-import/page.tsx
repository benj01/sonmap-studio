import { Metadata } from 'next';
import { TestImportPage } from '@/components/geo-import/pages/test-import-page';

export const metadata: Metadata = {
  title: 'Test Import | SonMap Studio',
  description: 'Test geo data import functionality',
};

interface TestImportPageProps {
  params: {
    id: string;
  };
}

export default async function TestImportRoute({ params }: TestImportPageProps) {
  // Await the params to satisfy Next.js requirements
  const projectId = params.id;
  
  return <TestImportPage projectId={projectId} />;
} 
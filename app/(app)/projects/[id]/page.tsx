'use client'

import ProjectClient from './project-client';
import { useParams, useSearchParams } from 'next/navigation';

export default function ProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  // Convert URLSearchParams to the expected type
  const searchParamsObj: { [key: string]: string | string[] | undefined } = {};
  searchParams.forEach((value, key) => {
    const existing = searchParamsObj[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        searchParamsObj[key] = [existing, value];
      }
    } else {
      searchParamsObj[key] = value;
    }
  });

  if (!params.id) {
    throw new Error('Project ID is required');
  }

  return <ProjectClient projectId={params.id as string} searchParams={searchParamsObj} />;
}

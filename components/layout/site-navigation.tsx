// components/layout/site-navigation.tsx
import Link from 'next/link';

export function SiteNavigation() {
  return (
    <nav>
      <ul>
        <li>
          <Link href="/dashboard">Dashboard</Link>
        </li>
      </ul>
    </nav>
  );
}
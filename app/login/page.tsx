import { Suspense } from 'react';
import LoginClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · Resource Deployment' };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginClient />
    </Suspense>
  );
}

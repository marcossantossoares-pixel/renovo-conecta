import type { Metadata } from 'next';

import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Entrar · Renovo Conecta',
  robots: { index: false, follow: false },
};

export default function EntrarPage() {
  return <SignInForm />;
}

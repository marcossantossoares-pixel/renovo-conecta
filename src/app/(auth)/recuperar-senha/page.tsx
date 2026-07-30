import type { Metadata } from 'next';

import { PasswordResetForm } from './password-reset-form';

export const metadata: Metadata = {
  title: 'Recuperar senha · Renovo Conecta',
  robots: { index: false, follow: false },
};

export default function RecuperarSenhaPage() {
  return <PasswordResetForm />;
}

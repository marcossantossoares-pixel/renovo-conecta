import { z } from 'zod';

import { ROLE_CODES } from '@/core/auth/roles';

/**
 * Schemas de entrada da autenticação.
 *
 * O mesmo schema valida no cliente e no servidor. A validação do cliente é
 * conveniência; a do servidor é a que vale (docs/ARCHITECTURE.md §7).
 */

/**
 * Senha.
 *
 * Mínimo de 10 caracteres, **sem** regra de complexidade artificial e sem
 * expiração periódica (docs/SECURITY.md §2). Exigir símbolo e maiúscula produz
 * senhas piores e anotadas em papel; comprimento é o que realmente importa.
 *
 * A verificação contra listas de senhas vazadas fica com o Supabase Auth, que
 * consulta o HaveIBeenPwned quando habilitado no projeto.
 */
export const passwordSchema = z
  .string()
  .min(10, 'A senha precisa ter pelo menos 10 caracteres.')
  .max(72, 'A senha pode ter no máximo 72 caracteres.');

export const emailSchema = z
  .email('Informe um e-mail válido.')
  .transform((value) => value.trim().toLowerCase());

export const signInSchema = z.object({
  email: emailSchema,
  // Sem `min` aqui de propósito: no login, a regra de comprimento não deve
  // vazar informação nem trocar a mensagem neutra por um erro de formato.
  password: z.string().min(1, 'Informe sua senha.'),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas não coincidem.',
    path: ['passwordConfirmation'],
  });

export const createInvitationSchema = z.object({
  email: emailSchema,
  roleCode: z.enum(ROLE_CODES, 'Escolha o papel.'),
  // Campo oculto: só falha se alguém adulterar o formulário — e mesmo assim
  // a resposta não lista os valores aceitos.
  scopeType: z.enum(['congregation', 'elo'], 'Convite inválido.'),
  scopeId: z.uuid(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(1),
    fullName: z
      .string()
      .trim()
      .min(3, 'Informe seu nome completo.')
      .refine((value) => value.split(/\s+/).length >= 2, {
        message: 'Informe nome e sobrenome.',
      }),
    password: passwordSchema,
    passwordConfirmation: z.string(),
    acceptedTerms: z.literal(true, {
      message: 'É necessário aceitar os termos para continuar.',
    }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas não coincidem.',
    path: ['passwordConfirmation'],
  });

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const verifyMfaSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'O código tem 6 dígitos.'),
});

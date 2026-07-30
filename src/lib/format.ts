/**
 * Formatação e máscaras brasileiras.
 *
 * Regras que valem para todas as máscaras (docs/DESIGN_SYSTEM.md §5):
 *   - A máscara NUNCA impede colar. Ela normaliza o que foi colado.
 *   - A máscara nunca descarta silenciosamente o que o usuário digitou além do
 *     limite: ela trunca, e a validação (Zod) é quem recusa.
 *   - Nada aqui valida — formatar e validar são responsabilidades diferentes.
 */

const TIMEZONE = 'America/Bahia';

/** Remove tudo que não for dígito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Remove o código de país quando ele é inequívoco.
 *
 * Colar "+55 71 99999-8888" é comum — vem direto do WhatsApp. Sem este
 * tratamento, o "55" viraria o DDD e o telefone inteiro sairia deslocado.
 *
 * A checagem é segura porque não existe ambiguidade: um número nacional tem no
 * máximo 11 dígitos (DDD + 9). Portanto 12 ou 13 dígitos começando em "55" só
 * podem ser código de país, nunca o DDD 55 seguido de um número válido.
 */
function stripCountryCode(digits: string): string {
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits.slice(2);
  }

  return digits;
}

/**
 * Telefone brasileiro: `(71) 99999-9999` (celular) ou `(71) 3333-3333` (fixo).
 * Formata progressivamente, para funcionar enquanto o usuário digita.
 */
export function formatPhone(value: string): string {
  const digits = stripCountryCode(onlyDigits(value)).slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (rest.length <= 4) return `(${ddd}) ${rest}`;

  // 9 dígitos = celular; 8 = fixo.
  const cut = rest.length > 8 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/** CEP: `41000-000`. */
export function formatZipCode(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);

  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Data digitada: `dd/mm/aaaa`. */
export function formatDateInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Converte `dd/mm/aaaa` em `aaaa-mm-dd`, o formato que o servidor espera.
 * Retorna `null` se a data não existir no calendário (31/02, por exemplo).
 */
export function brDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  const date = new Date(Date.UTC(year, month - 1, day));

  // Descarta datas que "transbordam" o mês: o Date corrige 31/02 para 03/03.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converte `aaaa-mm-dd` em `dd/mm/aaaa`. Inverso de `brDateToIso`.
 *
 * Existe em vez de reaproveitar `formatDate` porque uma coluna `date` do
 * PostgreSQL **não tem fuso**: ela é um dia do calendário, não um instante.
 * Passá-la por `formatDate` obrigaria a inventar uma hora — e `1988-05-14`
 * interpretado como meia-noite UTC vira 13/05 em Camaçari, que é UTC-3. Um
 * aniversário exibido um dia antes é o tipo de erro que ninguém reporta como
 * bug do sistema; a pessoa só conclui que o cadastro está errado.
 */
export function isoDateToBr(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());

  if (!match) return '';

  const [, yyyy, mm, dd] = match as unknown as [string, string, string, string];

  return `${dd}/${mm}/${yyyy}`;
}

/** Formata data para exibição: `25/07/2026`. */
export function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(date);
}

/**
 * Formata data e hora: `25/07/2026 19:30`.
 *
 * Montado a partir das duas partes de propósito: o `Intl` combinado insere uma
 * vírgula (`25/07/2026, 19:30`), que polui listas e tabelas.
 */
export function formatDateTime(value: Date | string): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

/** Formata hora: `19:30`. */
export function formatTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  }).format(date);
}

/** Moeda em reais: `R$ 1.234,56`. */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/** Número com separador de milhar brasileiro. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

/**
 * Iniciais para avatar. Usa o primeiro e o último nome — ignorar partículas
 * ("de", "da", "dos") evita gerar iniciais como "MD" para "Maria da Silva".
 */
export function getInitials(fullName: string): string {
  const particles = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0 && !particles.has(part.toLowerCase()));

  if (parts.length === 0) return '';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();

  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';

  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/**
 * Nome curto para exibição em espaço limitado: primeiro nome + último
 * sobrenome. Nomes longos são comuns no Brasil e quebram tabelas.
 */
export function formatShortName(fullName: string): string {
  const particles = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length <= 2) return fullName.trim();

  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';

  // Se o último termo for partícula, o nome está malformado: devolve como veio.
  if (particles.has(last.toLowerCase())) return fullName.trim();

  return `${first} ${last}`;
}

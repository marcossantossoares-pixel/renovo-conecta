/**
 * Seeds de demonstração.
 *
 * Roda com a conexão administrativa (que ignora RLS), porque precisa criar o
 * tenant, os papéis e o primeiro usuário — situação em que ainda não existe
 * ninguém para ter contexto. Este é um dos usos legítimos previstos em
 * docs/SECURITY.md §4.
 *
 * Propriedades:
 *   - **Recusa-se a rodar contra produção.** Falha explícita, não silenciosa.
 *   - **Idempotente:** rodar duas vezes não duplica nem quebra.
 *   - **Determinístico:** os mesmos identificadores em toda execução, para que
 *     os testes de isolamento possam referenciá-los.
 *
 * Execução: `pnpm db:seed`
 */

import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { ALL_PERMISSIONS, PERMISSION_GRANTS } from '../../src/core/authz/catalog.ts';
import {
  CONGREGACAO_CENTRAL,
  CONGREGACAO_OUTRA,
  COORDENADORA,
  ELOS,
  ELO_OUTRO_TENANT,
  ESTUDOS,
  LIDERANCA,
  MOTIVO_CORRECAO,
  RELATORIOS,
  PARTICIPANTES,
  PASTOR,
  PASTOR_OUTRO_TENANT,
  ROLES,
  SOLICITACAO_DEMO,
  TELEFONE_FICTICIO,
  TEXTO_POLITICA_DEMO,
  TEXTO_TERMOS_DEMO,
  TENANT_DEMO,
  TENANT_OUTRO,
  VERSAO_POLITICA_DEMO,
  VISITANTES,
  participantesDoElo,
} from './fixtures.ts';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Em CI as variáveis já vêm do ambiente.
}

const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_MIGRATION_URL ou DATABASE_URL precisa estar definida.');
}

/**
 * Trava de segurança.
 *
 * Dados fictícios em produção seriam, na melhor hipótese, constrangedores; na
 * pior, se misturariam a pessoas reais. A checagem é por ambiente E por
 * endereço do banco — depender de uma só das duas deixaria brecha.
 */
function assertAmbienteSeguro(url: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seeds não rodam com NODE_ENV=production.');
  }

  const host = new URL(url).hostname;
  const hostsPermitidos = ['127.0.0.1', 'localhost', 'db', 'postgres'];

  if (!hostsPermitidos.includes(host)) {
    throw new Error(
      `Seeds recusados: o banco "${host}" não parece ser local. ` +
        'Para semear homologação, defina o host explicitamente nesta lista ' +
        'depois de confirmar que não é produção.',
    );
  }
}

assertAmbienteSeguro(databaseUrl);

// Sem o schema do Drizzle de propósito: o seed usa apenas SQL literal, e
// importá-lo obrigaria o executor de TypeScript do Node a resolver a árvore
// inteira de módulos do `src/`.
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

const hoje = new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  console.log('Semeando dados fictícios…');

  await db.transaction(async (tx) => {
    // A ordem importa: tudo depende de tenant e congregação.
    await tx.execute(sql`
      INSERT INTO tenant (id, name, slug)
      VALUES
        (${TENANT_DEMO}::uuid, 'Igreja Demonstração', 'demo'),
        (${TENANT_OUTRO}::uuid, 'Igreja Vizinha (isolamento)', 'vizinha')
      ON CONFLICT (id) DO NOTHING
    `);

    await tx.execute(sql`
      INSERT INTO congregation (id, tenant_id, name, city, state)
      VALUES
        (${CONGREGACAO_CENTRAL}::uuid, ${TENANT_DEMO}::uuid,
         'Congregação Central', 'Cidade Fictícia', 'BA'),
        (${CONGREGACAO_OUTRA}::uuid, ${TENANT_OUTRO}::uuid,
         'Congregação Vizinha', 'Outra Cidade', 'BA')
      ON CONFLICT (id) DO NOTHING
    `);

    await tx.execute(sql`
      INSERT INTO system_setting (tenant_id, key, value, description, is_public)
      VALUES (
        ${TENANT_DEMO}::uuid, 'app.name', '"Renovo Conecta"'::jsonb,
        'Nome exibido do sistema. Provisório e alterável sem deploy.', true
      )
      ON CONFLICT (tenant_id, key) DO NOTHING
    `);

    // --- Papéis e permissões -------------------------------------------
    for (const tenantId of [TENANT_DEMO, TENANT_OUTRO]) {
      for (const role of ROLES) {
        await tx.execute(sql`
          INSERT INTO role (tenant_id, code, name, level, is_system)
          VALUES (${tenantId}::uuid, ${role.code}, ${role.name},
                  ${String(role.level)}, true)
          ON CONFLICT (tenant_id, code) DO NOTHING
        `);
      }
    }

    for (const code of ALL_PERMISSIONS) {
      const [resource, action] = code.split('.');
      await tx.execute(sql`
        INSERT INTO permission (code, resource, action)
        VALUES (${code}, ${resource ?? ''}, ${action ?? ''})
        ON CONFLICT (code) DO NOTHING
      `);
    }

    /*
     * Mapa papel → permissão → escopo.
     *
     * Gravado a partir de `src/core/authz/catalog.ts` — a MESMA origem que
     * alimenta o motor `can()`. Duas listas mantidas à mão divergiriam, e a
     * divergência seria silenciosa: a interface ofereceria o que o servidor
     * recusa, ou pior, o contrário.
     */
    for (const tenantId of [TENANT_DEMO, TENANT_OUTRO]) {
      for (const [code, grants] of Object.entries(PERMISSION_GRANTS)) {
        for (const [roleCode, scope] of Object.entries(grants)) {
          await tx.execute(sql`
            INSERT INTO role_permission
              (tenant_id, role_id, permission_id, default_scope)
            SELECT ${tenantId}::uuid, r.id, p.id, ${scope}::scope_type
              FROM role r, permission p
             WHERE r.tenant_id = ${tenantId}::uuid
               AND r.code = ${roleCode}
               AND p.code = ${code}
               AND NOT EXISTS (
                 SELECT 1 FROM role_permission rp
                  WHERE rp.role_id = r.id AND rp.permission_id = p.id
               )
          `);
        }
      }
    }

    // --- Pessoas da liderança -------------------------------------------
    for (const [index, pessoa] of LIDERANCA.entries()) {
      await tx.execute(sql`
        INSERT INTO person (
          id, tenant_id, congregation_id, full_name, email, phone,
          church_status, birth_date, membership_at
        )
        VALUES (
          ${pessoa.personId}::uuid, ${TENANT_DEMO}::uuid,
          ${CONGREGACAO_CENTRAL}::uuid, ${pessoa.fullName}, ${pessoa.email},
          ${TELEFONE_FICTICIO(index + 1)},
          ${pessoa.roleCode === 'pastor_admin' ? 'pastor' : 'lider'}::church_status,
          ${`${1970 + index}-06-21`}::date, '2020-01-15'::date
        )
        ON CONFLICT (id) DO NOTHING
      `);

      await tx.execute(sql`
        INSERT INTO app_user (
          id, tenant_id, congregation_id, person_id, email, is_active
        )
        VALUES (
          ${pessoa.userId}::uuid, ${TENANT_DEMO}::uuid,
          ${CONGREGACAO_CENTRAL}::uuid, ${pessoa.personId}::uuid,
          ${pessoa.email}, true
        )
        ON CONFLICT (id) DO NOTHING
      `);

      await tx.execute(sql`
        INSERT INTO user_role_assignment (
          tenant_id, congregation_id, app_user_id, role_id, scope_type, scope_id
        )
        SELECT ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
               ${pessoa.userId}::uuid, r.id, 'congregation'::scope_type,
               ${CONGREGACAO_CENTRAL}::uuid
          FROM role r
         WHERE r.tenant_id = ${TENANT_DEMO}::uuid AND r.code = ${pessoa.roleCode}
           AND NOT EXISTS (
             SELECT 1 FROM user_role_assignment ura
              WHERE ura.app_user_id = ${pessoa.userId}::uuid AND ura.role_id = r.id
           )
      `);
    }

    // --- Participantes e visitantes -------------------------------------
    for (const [index, pessoa] of [...PARTICIPANTES, ...VISITANTES].entries()) {
      /*
       * ⚠️ `created_at` é **espalhado ao longo do último ano**, e não deixado no
       * padrão `now()`.
       *
       * Com todo mundo cadastrado no mesmo instante, o gráfico de crescimento
       * mensal da Fase 10 vira uma barra só — um gráfico que não mostra
       * crescimento nenhum e ocupa meia tela. Pior: ele se parece exatamente com
       * um gráfico quebrado, e quem estivesse verificando a fase não teria como
       * distinguir os dois casos.
       *
       * A distribuição é determinística (`index % 10`) para o seed continuar
       * reproduzível: dois `db:seed` produzem os mesmos meses.
       */
      const mesesAtras = index % 10;

      await tx.execute(sql`
        INSERT INTO person (
          id, tenant_id, congregation_id, full_name, phone, church_status,
          birth_date, first_visit_at, created_at
        )
        VALUES (
          ${pessoa.id}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
          ${pessoa.fullName}, ${TELEFONE_FICTICIO(index + 100)},
          ${pessoa.churchStatus}::church_status,
          ${pessoa.birthDate}::date,
          ${pessoa.churchStatus === 'visitante' ? hoje : null}::date,
          now() - ${`${mesesAtras} months`}::interval
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }

    // --- Elos -------------------------------------------------------------
    for (const elo of ELOS) {
      await tx.execute(sql`
        INSERT INTO elo (
          id, tenant_id, congregation_id, name, internal_code, weekday,
          start_time, district, city, state, street, number, reference_point,
          status, opened_at
        )
        VALUES (
          ${elo.id}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
          ${elo.name}, ${elo.internalCode}, ${elo.weekday}::weekday,
          ${elo.startTime}::time, ${elo.district}, 'Cidade Fictícia', 'BA',
          ${elo.street}, '123', 'Em frente à praça fictícia',
          'ativo'::elo_status, '2024-02-01'::date
        )
        ON CONFLICT (id) DO NOTHING
      `);

      await tx.execute(sql`
        INSERT INTO elo_leadership (
          tenant_id, congregation_id, elo_id, person_id, role, starts_at
        )
        SELECT ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
               ${elo.id}::uuid, ${elo.leaderPersonId}::uuid,
               'lider'::leadership_role, '2024-02-01'::date
         WHERE NOT EXISTS (
           SELECT 1 FROM elo_leadership
            WHERE elo_id = ${elo.id}::uuid
              AND person_id = ${elo.leaderPersonId}::uuid
              AND role = 'lider'::leadership_role
         )
      `);

      await tx.execute(sql`
        INSERT INTO supervision_assignment (
          tenant_id, congregation_id, supervisor_person_id, elo_id, starts_at
        )
        SELECT ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
               ${elo.supervisorPersonId}::uuid, ${elo.id}::uuid,
               '2024-02-01'::date
         WHERE NOT EXISTS (
           SELECT 1 FROM supervision_assignment
            WHERE elo_id = ${elo.id}::uuid
              AND supervisor_person_id = ${elo.supervisorPersonId}::uuid
         )
      `);

      for (const participante of participantesDoElo(elo)) {
        await tx.execute(sql`
          INSERT INTO elo_participant (
            tenant_id, congregation_id, elo_id, person_id, joined_at, is_active
          )
          SELECT ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
                 ${elo.id}::uuid, ${participante.id}::uuid,
                 '2024-03-01'::date, true
           WHERE NOT EXISTS (
             SELECT 1 FROM elo_participant
              WHERE elo_id = ${elo.id}::uuid AND person_id = ${participante.id}::uuid
           )
        `);
      }
    }

    /* --- Relatórios semanais ---------------------------------------------
     *
     * Os cenários de `docs/DEMO_DATA.md` §3. Sem eles o dashboard da Fase 10
     * mostra zeros, e "Elos sem relatório na semana" — o indicador principal da
     * coordenação — não tem como ser distinguido de um indicador quebrado.
     *
     * A data do encontro é calculada a partir de **quantas semanas atrás**, e
     * não gravada fixa: o indicador fala da semana corrente, e uma data cravada
     * sairia dela sozinha com o tempo.
     */
    for (const relatorio of RELATORIOS) {
      const total = relatorio.happened
        ? (relatorio.membersPresent ?? 0) +
          (relatorio.visitorsPresent ?? 0) +
          (relatorio.childrenPresent ?? 0)
        : null;

      const linhas = await tx.execute<{ id: string }>(sql`
        INSERT INTO elo_report (
          tenant_id, congregation_id, elo_id, meeting_date, happened,
          cancellation_reason, study_title, members_present, visitors_present,
          children_present, total_present, new_decisions, referred_for_follow_up,
          status, submitted_at, approved_at
        )
        VALUES (
          ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
          ${relatorio.eloId}::uuid,
          (app.hoje() - ${relatorio.semanasAtras * 7}::integer),
          ${relatorio.happened}, ${relatorio.cancellationReason ?? null},
          ${relatorio.studyTitle ?? null},
          ${relatorio.membersPresent ?? null}, ${relatorio.visitorsPresent ?? null},
          ${relatorio.childrenPresent ?? null}, ${total},
          ${relatorio.newDecisions ?? null}, ${relatorio.referredForFollowUp ?? null},
          ${relatorio.status}::report_status,
          now() - ${`${relatorio.semanasAtras * 7} days`}::interval,
          ${relatorio.status === 'aprovado' ? sql`now()` : sql`NULL`}
        )
        ON CONFLICT (elo_id, meeting_date) WHERE deleted_at IS NULL
        DO NOTHING
        RETURNING id
      `);

      const criado = linhas[0];

      // `DO NOTHING` não devolve linha quando o relatório já existia: o seed é
      // idempotente, e reescrever o histórico de um relatório já semeado seria
      // pior que não fazer nada.
      if (!criado) continue;

      await tx.execute(sql`
        INSERT INTO elo_report_status_history (
          tenant_id, report_id, from_status, to_status, comment
        )
        VALUES (
          ${TENANT_DEMO}::uuid, ${criado.id}::uuid, NULL,
          'enviado'::report_status, NULL
        )
      `);

      /*
       * A segunda linha do histórico, quando o relatório não parou em
       * `enviado`. O comentário é obrigatório na correção — o `CHECK` da
       * migration 0013 recusa pedir correção sem dizer o que corrigir, porque
       * o líder reenviaria igual.
       */
      if (relatorio.status !== 'enviado') {
        await tx.execute(sql`
          INSERT INTO elo_report_status_history (
            tenant_id, report_id, from_status, to_status, comment
          )
          VALUES (
            ${TENANT_DEMO}::uuid, ${criado.id}::uuid, 'enviado'::report_status,
            ${relatorio.status}::report_status,
            ${relatorio.status === 'correcao_solicitada' ? MOTIVO_CORRECAO : null}
          )
        `);
      }
    }

    /* --- Estudos semanais ------------------------------------------------
     *
     * Dois, como pede `docs/DEMO_DATA.md` §4: um publicado e um agendado para
     * data futura. O agendado é o que dá o que provar ao caso 10 de
     * `docs/PERMISSIONS.md` §7 — sem ele, "rascunho e agendado são invisíveis
     * ao líder" é uma afirmação sem teste.
     *
     * As datas são **relativas a hoje**, e não fixas. Um `publish_at` cravado
     * em 2026 vira passado sozinho com o tempo, e o dia em que isso
     * acontecesse o estudo agendado passaria a ser público — a suíte quebraria
     * meses depois, sem que ninguém tivesse tocado no código.
     */
    for (const estudo of ESTUDOS) {
      const agendado = estudo.status === 'agendado';

      await tx.execute(sql`
        INSERT INTO weekly_study (
          id, tenant_id, congregation_id, title, theme, base_text,
          support_verses, introduction, conclusion, weekly_challenge,
          closing_prayer, usable_from, usable_until, status,
          publish_at, published_at, author_person_id
        )
        VALUES (
          ${estudo.id}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
          ${estudo.title}, ${estudo.theme}, ${estudo.baseText},
          ${estudo.supportVerses}, ${estudo.introduction}, ${estudo.conclusion},
          ${estudo.weeklyChallenge}, ${estudo.closingPrayer},
          (app.hoje() + ${estudo.emDias}::integer),
          (app.hoje() + ${estudo.emDias + 6}::integer),
          ${estudo.status}::study_status,
          ${agendado ? sql`now() + ${`${estudo.emDias} days`}::interval` : sql`NULL`},
          ${agendado ? sql`NULL` : sql`now() + ${`${estudo.emDias} days`}::interval`},
          ${COORDENADORA.personId}::uuid
        )
        ON CONFLICT (id) DO NOTHING
      `);

      const secoes: readonly (readonly [string, readonly string[]])[] = [
        ['topico', estudo.topicos],
        ['pergunta', estudo.perguntas],
        ['aplicacao', estudo.aplicacoes],
      ];

      for (const [kind, itens] of secoes) {
        for (const [posicao, conteudo] of itens.entries()) {
          await tx.execute(sql`
            INSERT INTO study_section (
              tenant_id, weekly_study_id, kind, position, content
            )
            SELECT ${TENANT_DEMO}::uuid, ${estudo.id}::uuid,
                   ${kind}::study_section_kind, ${posicao}, ${conteudo}
             WHERE NOT EXISTS (
               SELECT 1 FROM study_section
                WHERE weekly_study_id = ${estudo.id}::uuid
                  AND kind = ${kind}::study_section_kind
                  AND position = ${posicao}
             )
          `);
        }
      }
    }

    // --- Privacidade: política, consentimento e solicitação --------------
    /*
     * A versão da política precisa existir **antes** de qualquer consentimento:
     * sem versão vigente, `recordConsent` recusa a coleta em vez de gravar uma
     * prova que não prova nada (`modules/privacy/policy.ts`).
     */
    await tx.execute(sql`
      INSERT INTO system_setting (tenant_id, key, value, description, is_public)
      VALUES (
        ${TENANT_DEMO}::uuid, 'privacy.policy_version',
        ${JSON.stringify(VERSAO_POLITICA_DEMO)}::jsonb,
        'Versão vigente da política de privacidade. Rascunho: o texto e a base '
        'legal dependem de validação jurídica (docs/LGPD.md §2).', true
      )
      ON CONFLICT (tenant_id, key) DO NOTHING
    `);

    // O texto que a tela de política exibe. Rascunho declarado, pelo mesmo
    // motivo da versão: fingir uma minuta aprovada seria pior que não ter.
    for (const [chave, texto] of [
      ['privacy.policy_text', TEXTO_POLITICA_DEMO],
      ['privacy.terms_text', TEXTO_TERMOS_DEMO],
    ] as const) {
      await tx.execute(sql`
        INSERT INTO system_setting (tenant_id, key, value, description, is_public)
        VALUES (
          ${TENANT_DEMO}::uuid, ${chave}, ${JSON.stringify(texto)}::jsonb,
          'Texto de demonstração, sem validade jurídica (docs/LGPD.md §2).', true
        )
        ON CONFLICT (tenant_id, key) DO NOTHING
      `);
    }

    /*
     * Um consentimento concedido, para a tela ter o que mostrar — e os DOIS
     * menores continuam **sem** consentimento de imagem, exatamente como
     * `DEMO_DATA.md` §3 pede: é o cenário que exercita o bloqueio do Art. 14.
     */
    const titularDemo = PARTICIPANTES[0];

    if (titularDemo) {
      await tx.execute(sql`
        INSERT INTO consent (
          tenant_id, congregation_id, person_id, purpose, granted,
          policy_version, collected_via, notes
        )
        SELECT ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
               ${titularDemo.id}::uuid, 'cadastro_pastoral'::consent_purpose, true,
               ${VERSAO_POLITICA_DEMO}, 'presencial',
               'Consentimento fictício, colhido em ficha de cadastro de demonstração.'
         WHERE NOT EXISTS (
           SELECT 1 FROM consent
            WHERE person_id = ${titularDemo.id}::uuid
              AND purpose = 'cadastro_pastoral'::consent_purpose
         )
      `);

      await tx.execute(sql`
        INSERT INTO data_subject_request (
          id, tenant_id, congregation_id, person_id, kind, status,
          description, due_at, created_by
        )
        VALUES (
          ${SOLICITACAO_DEMO.id}::uuid, ${TENANT_DEMO}::uuid,
          ${CONGREGACAO_CENTRAL}::uuid, ${titularDemo.id}::uuid,
          ${SOLICITACAO_DEMO.kind}::data_subject_request_kind, 'aberta',
          ${SOLICITACAO_DEMO.description},
          now() + interval '10 days', ${PASTOR.userId}::uuid
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }

    // --- Segundo tenant, para os testes de isolamento --------------------
    await tx.execute(sql`
      INSERT INTO person (
        id, tenant_id, congregation_id, full_name, email, church_status
      )
      VALUES (
        ${PASTOR_OUTRO_TENANT.personId}::uuid, ${TENANT_OUTRO}::uuid,
        ${CONGREGACAO_OUTRA}::uuid, ${PASTOR_OUTRO_TENANT.fullName},
        ${PASTOR_OUTRO_TENANT.email}, 'pastor'::church_status
      )
      ON CONFLICT (id) DO NOTHING
    `);

    await tx.execute(sql`
      INSERT INTO app_user (
        id, tenant_id, congregation_id, person_id, email
      )
      VALUES (
        ${PASTOR_OUTRO_TENANT.userId}::uuid, ${TENANT_OUTRO}::uuid,
        ${CONGREGACAO_OUTRA}::uuid, ${PASTOR_OUTRO_TENANT.personId}::uuid,
        ${PASTOR_OUTRO_TENANT.email}
      )
      ON CONFLICT (id) DO NOTHING
    `);

    await tx.execute(sql`
      INSERT INTO elo (
        id, tenant_id, congregation_id, name, internal_code, weekday,
        start_time, district, street
      )
      VALUES (
        ${ELO_OUTRO_TENANT}::uuid, ${TENANT_OUTRO}::uuid,
        ${CONGREGACAO_OUTRA}::uuid, 'Elo da Igreja Vizinha', 'ELO-V01',
        'sabado'::weekday, '18:00'::time, 'Bairro Distante',
        'Rua Que Ninguém Do Outro Tenant Pode Ver'
      )
      ON CONFLICT (id) DO NOTHING
    `);
  });

  await provisionarContasDeAcesso();

  const linhas = await db.execute<{ pessoas: number }>(
    sql`SELECT count(*)::int AS pessoas FROM person WHERE tenant_id = ${TENANT_DEMO}::uuid`,
  );

  console.log(
    `Concluído. ${linhas[0]?.pessoas ?? 0} pessoas no tenant de demonstração.`,
  );
  console.log(`${ELOS.length} Elos, ${LIDERANCA.length} contas de liderança.`);
  console.log(`${ESTUDOS.length} estudos: um publicado e um agendado.`);
  console.log(
    `${RELATORIOS.length} relatórios; o Elo Alicerce fica sem o da semana, de propósito.`,
  );
  console.log('Segundo tenant criado para os testes de isolamento.');
}

/**
 * Cria as contas de autenticação das pessoas da liderança.
 *
 * Sem isto, os registros em `app_user` existem mas ninguém consegue entrar —
 * e nem o login nem os testes ponta a ponta teriam o que exercitar.
 *
 * As contas nascem com `email_confirm: true`: no ambiente de demonstração não
 * há caixa de entrada para confirmar, e exigir confirmação apenas travaria o
 * seed. **Em produção a confirmação continua obrigatória** — quem entra por
 * convite prova a posse do e-mail ao abrir o link.
 */
async function provisionarContasDeAcesso(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const senha = process.env.SEED_DEMO_PASSWORD;

  if (!supabaseUrl || !serviceRoleKey) {
    console.log('Supabase Auth não configurado; contas de acesso não criadas.');
    return;
  }

  if (!senha || senha.length < 10) {
    throw new Error(
      'SEED_DEMO_PASSWORD precisa ter ao menos 10 caracteres. ' +
        'Defina no .env.local — nunca no repositório.',
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existentes } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const porEmail = new Map(
    (existentes?.users ?? []).map((usuario) => [usuario.email ?? '', usuario.id]),
  );

  let criadas = 0;

  for (const pessoa of LIDERANCA) {
    let authUserId = porEmail.get(pessoa.email);

    if (!authUserId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: pessoa.email,
        password: senha,
        email_confirm: true,
      });

      if (error || !data.user) {
        console.warn(`Não foi possível criar a conta de ${pessoa.email}.`);
        continue;
      }

      authUserId = data.user.id;
      criadas += 1;
    }

    await db.execute(sql`
      UPDATE app_user
         SET auth_user_id = ${authUserId}::uuid
       WHERE id = ${pessoa.userId}::uuid
         AND (auth_user_id IS DISTINCT FROM ${authUserId}::uuid)
    `);
  }

  console.log(
    `Contas de acesso: ${criadas} criadas, ${LIDERANCA.length - criadas} já existiam.`,
  );
}

try {
  await main();
} finally {
  await client.end();
}

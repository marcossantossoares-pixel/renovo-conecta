# Implantação — Renovo Conecta

- **Versão:** 1.0 · **Data:** 2026-07-25
- Relacionado: `SECURITY.md`, `LGPD.md`, `ARCHITECTURE.md` §10.

> **Regra permanente: nenhum deploy automático.** Produção só recebe versão por acionamento explícito e autorizado.

---

## 1. Ambientes

| Ambiente      | Aplicação              | Banco                        | Dados                                            | Quem acessa                                          |
| ------------- | ---------------------- | ---------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `local`       | `pnpm dev`             | Supabase local (Docker)      | Somente seeds fictícios                          | Desenvolvimento                                      |
| `homologação` | Preview da Vercel      | Projeto Supabase separado    | Somente seeds fictícios                          | Desenvolvimento + liderança da igreja para validação |
| `produção`    | Vercel (deploy manual) | Projeto Supabase de produção | Dados reais, **após validação jurídica de LGPD** | Usuários da igreja                                   |

**Cada ambiente tem projeto Supabase próprio.** Nunca compartilhar banco entre ambientes. Nunca copiar dados de produção para homologação ou local.

---

## 2. Pré-requisitos locais

| Ferramenta     | Versão             | Situação nesta máquina                  |
| -------------- | ------------------ | --------------------------------------- |
| Node.js        | 22 LTS ou superior | ✅ 24.18.0                              |
| pnpm           | 9 ou superior      | ❌ instalar: `npm i -g pnpm`            |
| Git            | 2.40+              | ✅ 2.55.0                               |
| Docker Desktop | atual              | ❌ **necessário para o Supabase local** |
| Supabase CLI   | atual              | A instalar na Fase 1                    |

**Sem Docker**, a alternativa é usar um projeto Supabase remoto de desenvolvimento — funciona, mas torna o desenvolvimento dependente de conexão e não permite recriar o banco livremente.

---

## 3. Primeira execução local

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

```bash
supabase start
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Os comandos acima refletem os scripts previstos para a Fase 1. Antes dela, nenhum deles existe.

---

## 4. Variáveis de ambiente

Catálogo completo em `.env.example`. Regras:

- **Nenhum segredo real é versionado.** `.env` e variantes estão no `.gitignore`; apenas `.env.example` entra no repositório, com valores fictícios.
- Variáveis com prefixo `NEXT_PUBLIC_` **vão para o navegador**. Nada sensível recebe esse prefixo.
- `SUPABASE_SERVICE_ROLE_KEY` ignora toda a RLS: existe apenas no servidor, nunca no cliente, e seu uso é restrito a `src/core/db/admin.ts` (`SECURITY.md` §4).
- As variáveis são validadas na inicialização com Zod. Faltando ou malformada, a aplicação **não sobe** — falha cedo e de forma clara.
- Segredos ficam nas configurações da Vercel e do Supabase, separados por ambiente.

---

## 5. Integração contínua

GitHub Actions em cada push e pull request:

```
lint → typecheck → test → test:rls → build → test:e2e
```

Complementos:

- Scan de segredos no repositório.
- Auditoria de dependências; vulnerabilidade alta ou crítica bloqueia o merge.
- Verificação de que as migrations aplicam **do zero** em banco limpo.

**Qualquer etapa vermelha bloqueia o merge.**

---

## 6. Migrations em produção

Ordem obrigatória:

1. Revisar o SQL gerado manualmente — inclusive as políticas de RLS, que são escritas à mão.
2. Aplicar em homologação e rodar a suíte de isolamento.
3. **Confirmar backup recente do banco de produção.**
4. Aplicar em produção em janela de baixo uso.
5. Verificar a aplicação e a suíte de RLS contra produção.
6. Registrar em `CHANGELOG.md`.

**Migration destrutiva** (remoção de coluna ou tabela, mudança de tipo com perda) exige ADR em `DECISIONS.md` e autorização explícita. O caminho padrão é aditivo: adicionar, migrar dados, só então remover — em versões separadas.

---

## 7. Procedimento de deploy em produção

Executado apenas mediante solicitação e autorização.

**Antes:**

- [ ] CI verde na branch
- [ ] Checklist de `SECURITY.md` §13 revisado
- [ ] Checklist de `LGPD.md` §10 revisado
- [ ] Migrations aplicadas e validadas em homologação
- [ ] Backup de produção confirmado
- [ ] `CHANGELOG.md` atualizado

**Durante:**

1. Aplicar as migrations.
2. Publicar a aplicação.
3. Verificar healthcheck e login.
4. Verificar cabeçalhos de segurança na resposta real.
5. Executar a suíte de isolamento contra produção.

**Depois:**

- [ ] Monitorar erros por 24 h
- [ ] Confirmar que nenhum dado pessoal apareceu em log
- [ ] Atualizar `PROGRESS.md`

---

## 8. Reversão

| Situação                      | Ação                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| Falha apenas na aplicação     | Reverter para a versão anterior na Vercel                                 |
| Falha em migration aditiva    | Reverter a aplicação; a migration pode permanecer                         |
| Falha em migration destrutiva | Restaurar backup — **por isso migrations destrutivas são evitadas**       |
| Suspeita de vazamento         | Seguir `SECURITY.md` §12: conter, avaliar, registrar, comunicar, corrigir |

Reversão sempre precede diagnóstico. Primeiro estabilizar, depois entender.

---

## 9. Backups

- Backups automáticos do Supabase, com retenção conforme o plano contratado.
- Restauração testada pelo menos uma vez antes da entrada em produção, e depois periodicamente.
- **Proibido manter cópia local de banco de produção**, inclusive para depuração.
- Backups contêm dados pessoais: mesmo controle de acesso do banco (`LGPD.md`).

---

## 10. Monitoramento

| O quê              | Como                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| Erros de aplicação | Sentry, com scrubbing de dados pessoais                                   |
| Disponibilidade    | Healthcheck externo na rota `/api/health`                                 |
| Desempenho         | Métricas da Vercel                                                        |
| Banco              | Painel do Supabase: conexões, consultas lentas, uso de disco              |
| Segurança          | Revisão periódica de `audit_log`, com atenção a acessos a dados restritos |

**Nenhuma ferramenta de monitoramento recebe dado pessoal.**

---

## 11. Custos e escala

Escala esperada no primeiro ano: uma congregação, algumas centenas de pessoas, dezenas de Elos, poucas dezenas de usuários com login. Os planos gratuitos ou iniciais de Vercel e Supabase tendem a atender.

Pontos que puxam custo antes do previsto: armazenamento de fotos e anexos de estudos, e volume de `audit_log`. Mitigações: limite de tamanho por arquivo, compressão de imagem e política de retenção.

**A decisão de plano contratado é da igreja** e deve considerar também a região de armazenamento (`LGPD.md` §9).

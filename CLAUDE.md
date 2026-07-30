# Renovo Conecta

Sistema de gestão da Igreja Renovo Camaçari.

## Referência principal

A especificação completa está em `docs/MASTER_SPEC.md`.

Antes de planejar uma nova fase ou módulo, leia as partes relevantes desse documento.

## Regras permanentes

- Use TypeScript com tipagem estrita.
- Não utilize `any` sem justificativa.
- Nunca exponha chaves, senhas ou dados pessoais.
- Nunca use dados reais da Igreja Renovo em seeds ou testes.
- Toda entrada deve ser validada no servidor.
- Toda autorização deve ser verificada no servidor.
- Não confie apenas na interface para restringir dados.
- Execute lint, typecheck e testes após alterações relevantes.
- Não continue para outra fase enquanto existirem erros conhecidos.
- Não faça deploy automaticamente.
- Não apague arquivos sem analisar suas dependências.
- Não altere decisões arquitetônicas sem registrar a justificativa.
- Não implemente funcionalidades fora da fase atual.

## Fluxo de trabalho

Antes de editar:

1. Leia `docs/MASTER_SPEC.md`.
2. Leia `docs/PROGRESS.md`.
3. Leia `docs/DECISIONS.md`.
4. Inspecione o código relacionado.
5. Apresente um plano objetivo.

Depois de editar:

1. Execute lint.
2. Execute typecheck.
3. Execute os testes relacionados.
4. Revise as alterações.
5. Atualize `docs/PROGRESS.md`.
6. Informe arquivos criados e modificados.
7. Não faça commit sem solicitação ou autorização.

## Prioridade atual

Consultar `docs/PROGRESS.md`.

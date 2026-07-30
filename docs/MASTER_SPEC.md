# PROMPT MESTRE — SISTEMA RENOVO CONECTA

Atue como uma equipe sênior completa de desenvolvimento de software, formada por:

- Product Manager especializado em sistemas para igrejas;
- Arquiteto de software;
- Desenvolvedor full-stack sênior;
- Desenvolvedor mobile;
- Especialista em UX/UI;
- Engenheiro de banco de dados;
- Especialista em segurança, privacidade e LGPD;
- Engenheiro de DevOps;
- Analista de qualidade e testes.

Sua missão é planejar e desenvolver um sistema chamado provisoriamente **Renovo Conecta**, destinado à gestão da Igreja Renovo Camaçari.

O produto deve ser inspirado nas melhores funcionalidades encontradas em plataformas modernas de gestão e comunicação para igrejas, como o InPeace, mas deve possuir identidade, arquitetura, código, interface, textos e experiência próprios.

Não copie código, telas, identidade visual, textos, logotipo, elementos protegidos ou fluxos proprietários de nenhuma plataforma existente.

## 1. VISÃO DO PRODUTO

O Renovo Conecta será uma plataforma digital para centralizar:

- Gestão de membros e visitantes;
- Gestão dos pequenos grupos da igreja, chamados de Elos;
- Hierarquia de líderes, supervisores e coordenação;
- Acompanhamento da jornada espiritual das pessoas;
- Estudos semanais dos Elos;
- Frequência e relatórios dos encontros;
- Eventos, cursos e inscrições;
- Ministérios e voluntários;
- Comunicação da igreja;
- Pedidos de oração;
- Acompanhamento pastoral;
- Conteúdos, avisos e programações;
- Doações, dízimos e ofertas, futuramente;
- Aplicativo ou portal do membro;
- Indicadores administrativos e pastorais.

O sistema deve atender inicialmente à Igreja Renovo Camaçari, mas sua arquitetura deverá permitir futuramente:

- Novas congregações;
- Novas unidades;
- Diferentes igrejas;
- Personalização de nomenclaturas;
- Personalização de marca;
- Funcionamento no formato SaaS multi-tenant.

O primeiro lançamento será uma aplicação web responsiva e instalável como PWA, funcionando bem em celulares Android, iPhone, tablets e computadores.

## 2. IDENTIDADE DA IGREJA

Considere as seguintes informações:

- Igreja: Igreja Renovo Camaçari;
- Nome dos pequenos grupos: Elo;
- Plural: Elos;
- Valores: cristãos, bíblicos, acolhimento, comunhão, integridade, serviço, responsabilidade e cuidado com pessoas;
- Estilo visual: moderno, leve, acolhedor e profissional;
- Cores principais: verde, branco e tons neutros;
- A interface não deve parecer excessivamente corporativa;
- A linguagem deve ser simples, humana, cristã e acolhedora;
- O sistema deve transmitir organização sem perder a identidade pastoral.

Utilize provisoriamente o nome Renovo Conecta, mas permita que ele seja alterado facilmente nas configurações.

## 3. TIPOS DE USUÁRIO

Implemente controle de acesso baseado em funções e permissões.

### 3.1 Superadministrador

Pode:

- Administrar toda a plataforma;
- Criar congregações;
- Gerenciar configurações gerais;
- Visualizar logs;
- Gerenciar integrações;
- Configurar permissões;
- Visualizar todos os módulos;
- Administrar planos, caso o sistema se torne SaaS.

### 3.2 Pastor ou administrador da igreja

Pode:

- Acessar todos os dados da congregação;
- Gerenciar pessoas;
- Gerenciar Elos;
- Gerenciar eventos;
- Gerenciar conteúdos;
- Consultar relatórios;
- Configurar usuários e permissões;
- Visualizar informações pastorais autorizadas;
- Gerenciar ministérios e programações.

### 3.3 Coordenador de Elos

Pode:

- Visualizar toda a estrutura dos Elos;
- Cadastrar supervisores;
- Cadastrar líderes;
- Criar e editar Elos;
- Transferir pessoas;
- Consultar relatórios;
- Acompanhar multiplicações;
- Publicar estudos;
- Enviar comunicados aos líderes;
- Acompanhar Elos sem relatório enviado.

### 3.4 Supervisor de Elos

Pode:

- Visualizar somente os Elos sob sua supervisão;
- Acompanhar líderes;
- Consultar frequência;
- Consultar visitantes;
- Registrar visitas de supervisão;
- Fazer observações;
- Identificar Elos com dificuldades;
- Enviar mensagens aos líderes;
- Solicitar correções nos relatórios.

### 3.5 Líder de Elo

Pode:

- Visualizar seu Elo;
- Gerenciar participantes autorizados;
- Registrar frequência;
- Cadastrar visitantes;
- Registrar informações do encontro;
- Consultar o estudo semanal;
- Adicionar pedidos de oração;
- Registrar ações de acompanhamento;
- Enviar relatório semanal;
- Consultar o histórico do próprio Elo.

### 3.6 Vice-líder ou auxiliar

Possui permissões semelhantes às do líder, mas configuráveis.

### 3.7 Líder de ministério

Pode:

- Gerenciar seu ministério;
- Organizar escalas;
- Cadastrar voluntários;
- Enviar comunicados;
- Consultar disponibilidade;
- Registrar presença em atividades.

### 3.8 Membro

Pode:

- Atualizar os próprios dados permitidos;
- Consultar eventos;
- Inscrever-se em cursos;
- Consultar programações;
- Localizar um Elo;
- Solicitar participação em um Elo;
- Ler estudos e devocionais;
- Enviar pedidos de oração;
- Receber notificações;
- Visualizar sua carteirinha digital, quando habilitada.

### 3.9 Visitante

Pode:

- Criar um cadastro simples;
- Consultar informações públicas;
- Solicitar contato;
- Solicitar participação em um Elo;
- Inscrever-se em eventos públicos;
- Enviar pedido de oração.

## 4. MÓDULOS PRINCIPAIS

### 4.1 Autenticação e segurança

Implemente:

- Login por e-mail e senha;
- Recuperação de senha;
- Confirmação de e-mail;
- Login opcional por Google;
- Autenticação em dois fatores para administradores;
- Sessões seguras;
- Encerramento de sessões em outros dispositivos;
- Bloqueio temporário após tentativas excessivas;
- Rate limiting;
- Logs de acesso;
- Registro de alterações importantes;
- Controle de acesso por função;
- Controle de acesso por congregação;
- Row Level Security no banco de dados;
- Proteção contra acesso horizontal a dados;
- Expiração segura de tokens.

Nunca armazene senhas em texto puro.

### 4.2 Dashboard administrativo

O painel inicial deve exibir:

- Total de membros;
- Total de visitantes;
- Novos visitantes no período;
- Pessoas aguardando acompanhamento;
- Total de Elos ativos;
- Total de líderes;
- Total de supervisores;
- Frequência média dos Elos;
- Elos que ainda não enviaram relatório;
- Visitantes recebidos pelos Elos;
- Próximos eventos;
- Pedidos de oração pendentes;
- Aniversariantes;
- Pessoas afastadas ou sem participação recente;
- Crescimento mensal;
- Indicadores da jornada do membro;
- Atalhos para ações frequentes.

Permita filtros por:

- Período;
- Congregação;
- Supervisor;
- Elo;
- Faixa etária;
- Bairro;
- Situação cadastral.

Apresente gráficos acessíveis e também os dados em tabelas.

### 4.3 Gestão de pessoas

Crie um cadastro completo de pessoas.

**Dados pessoais**

- Nome completo;
- Nome social, quando aplicável;
- Foto;
- Data de nascimento;
- Sexo, somente se necessário e configurável;
- Estado civil;
- Telefone;
- WhatsApp;
- E-mail;
- Endereço;
- Bairro;
- Cidade;
- Estado;
- CEP;
- Contato de emergência;
- Observações autorizadas.

**Dados eclesiásticos**

- Visitante;
- Frequentador;
- Membro;
- Líder;
- Pastor;
- Voluntário;
- Data da primeira visita;
- Como conheceu a igreja;
- Decisão por Cristo;
- Batismo nas águas;
- Curso de integração;
- Recebimento como membro;
- Participação em Elo;
- Participação em ministérios;
- Congregação;
- Situação atual;
- Data da última atualização.

**Recursos adicionais**

- Busca avançada;
- Filtros;
- Etiquetas;
- Campos personalizados;
- Histórico de alterações;
- Importação por CSV;
- Exportação autorizada;
- Identificação de possíveis cadastros duplicados;
- Mesclagem segura de duplicidades;
- Linha do tempo da pessoa;
- Registro de contatos realizados;
- Responsável pelo acompanhamento;
- Tarefas de acompanhamento;
- Carteirinha digital com QR Code.

Não permita que qualquer usuário veja todos os dados. A visualização deve respeitar as permissões.

### 4.4 Jornada da pessoa

Crie uma jornada configurável, contendo etapas como:

- Primeira visita;
- Contato de boas-vindas;
- Retorno ao culto;
- Decisão por Cristo;
- Consolidação;
- Participação em um Elo;
- Curso de integração;
- Batismo;
- Recebimento como membro;
- Entrada em um ministério;
- Formação de liderança;
- Liderança de Elo.

Cada etapa deve permitir:

- Data;
- Responsável;
- Status;
- Observações;
- Próxima ação;
- Prazo;
- Histórico;
- Notificações;
- Campos personalizados.

A igreja deve poder alterar o nome, a ordem e as regras das etapas.

### 4.5 Gestão dos Elos

Este será um dos módulos mais importantes.

Cada Elo deverá possuir:

- Nome;
- Código interno;
- Status;
- Descrição;
- Perfil do público;
- Congregação;
- Supervisor;
- Líder;
- Vice-líder;
- Anfitrião;
- Dia da semana;
- Horário;
- Frequência;
- Endereço;
- Bairro;
- Ponto de referência;
- Localização no mapa;
- Modalidade presencial, on-line ou híbrida;
- Limite sugerido de participantes;
- Data de abertura;
- Data prevista para multiplicação;
- Elo de origem;
- Observações;
- Foto opcional.

**Privacidade do endereço**

O endereço completo de um Elo residencial não deve ser exibido publicamente.

Visitantes poderão visualizar apenas:

- Bairro;
- Região aproximada;
- Dia;
- Horário;
- Perfil do Elo;
- Botão para solicitar participação.

O endereço completo somente poderá ser exibido após aprovação ou conforme regras definidas pela igreja.

**Participantes**

Permita:

- Adicionar participantes;
- Aprovar solicitações;
- Transferir pessoas;
- Definir participante ativo ou inativo;
- Registrar entrada e saída;
- Consultar histórico;
- Identificar visitantes recorrentes;
- Registrar responsável pelo discipulado;
- Registrar potenciais líderes.

**Hierarquia**

A estrutura deverá permitir:

- Coordenação geral;
- Supervisores;
- Líderes;
- Vice-líderes;
- Elos;
- Participantes.

Exiba essa estrutura em:

- Árvore hierárquica;
- Lista;
- Cards;
- Organograma;
- Relatório exportável.

**Multiplicação**

Crie um fluxo para multiplicar um Elo:

- Selecionar Elo de origem;
- Definir novo líder;
- Definir novos participantes;
- Definir data;
- Criar o novo Elo;
- Manter histórico;
- Registrar vínculo entre Elo de origem e Elo multiplicado;
- Atualizar indicadores.

### 4.6 Relatório semanal do Elo

O líder deverá preencher o relatório de forma rápida pelo celular.

Campos:

- Data do encontro;
- Estudo utilizado;
- Nome do dirigente;
- Quantidade de membros presentes;
- Quantidade de visitantes;
- Quantidade de crianças;
- Quantidade total;
- Novas decisões por Cristo;
- Reconciliações;
- Pessoas encaminhadas para acompanhamento;
- Pedidos de oração;
- Testemunhos;
- Necessidades do Elo;
- Observações;
- O encontro aconteceu?;
- Motivo do cancelamento, quando aplicável;
- Próxima reunião;
- Fotos opcionais, com autorização.

Recursos:

- Salvar rascunho;
- Enviar relatório;
- Reabrir relatório mediante permissão;
- Aprovar ou solicitar correção;
- Lembrete automático;
- Histórico;
- Indicador de atraso;
- Relatório comparativo;
- Exportação em PDF e Excel;
- Confirmação de envio pelo WhatsApp, futuramente.

O dashboard deve mostrar:

- Elos com relatório enviado;
- Elos sem relatório;
- Frequência média;
- Crescimento;
- Visitantes;
- Decisões;
- Cancelamentos;
- Evolução por semana e mês.

### 4.7 Estudos semanais dos Elos

Crie um módulo específico para os estudos semanais.

O administrador poderá:

- Criar estudo;
- Editar estudo;
- Publicar estudo;
- Agendar publicação;
- Anexar PDF;
- Anexar vídeo;
- Anexar áudio;
- Inserir link;
- Definir texto bíblico;
- Inserir introdução;
- Criar tópicos;
- Criar perguntas para discussão;
- Inserir conclusão;
- Inserir desafio da semana;
- Inserir oração final;
- Associar o estudo a uma pregação;
- Definir período de utilização;
- Enviar notificação aos líderes.

Cada estudo deve possuir:

- Título;
- Tema;
- Texto base;
- Versículos de apoio;
- Conteúdo;
- Perguntas;
- Aplicação prática;
- Oração;
- Arquivos;
- Data de publicação;
- Autor;
- Versão;
- Status.

O líder deverá conseguir abrir o estudo pelo celular durante o encontro.

Inclua botão para gerar uma mensagem pronta para o grupo de WhatsApp dos líderes, contendo:

- Saudação cristã;
- Apresentação do estudo;
- Tema;
- Texto base;
- Orientação;
- Link do estudo;
- Palavra de encorajamento.

### 4.8 Eventos e cursos

Implemente:

- Criação de eventos;
- Cursos;
- Conferências;
- Mentorias;
- Cultos especiais;
- Encontros de líderes;
- Atividades esportivas;
- Ações sociais;
- Inscrições;
- Limite de vagas;
- Lista de espera;
- Categorias de ingresso;
- Eventos gratuitos ou pagos;
- Formulários personalizados;
- Confirmação por e-mail;
- Confirmação por WhatsApp, futuramente;
- QR Code;
- Check-in;
- Lista de presença;
- Certificado opcional;
- Exportação;
- Relatórios.

Para pagamentos, crie uma camada de integração desacoplada.

Não armazene dados de cartão.

Prepare a arquitetura para integração futura com provedores como Asaas, Mercado Pago ou outro serviço escolhido pela igreja.

### 4.9 Ministérios e voluntários

Permita cadastrar ministérios como:

- Louvor;
- Mídia;
- Recepção;
- Consolidação;
- Infantil;
- Esportes;
- Intercessão;
- Ação social;
- Diaconia;
- Outros.

Cada ministério deverá permitir:

- Líder;
- Vice-líder;
- Participantes;
- Funções;
- Escalas;
- Disponibilidade;
- Histórico;
- Treinamentos;
- Documentos;
- Comunicados;
- Presença;
- Troca de escala;
- Confirmação de participação.

### 4.10 Comunicação

Crie:

- Mural de notícias;
- Avisos;
- Devocionais;
- Comunicados;
- Notificações;
- Programação semanal;
- Banners;
- Conteúdos em destaque;
- Segmentação de público;
- Agendamento de publicação;
- Histórico de envios.

Permita segmentar por:

- Todos;
- Congregação;
- Membros;
- Visitantes;
- Líderes;
- Supervisores;
- Elo;
- Ministério;
- Evento;
- Faixa etária;
- Etiqueta.

Prepare integração futura com:

- Push notifications;
- E-mail;
- WhatsApp Business API;
- SMS.

Não implemente disparos por meios não oficiais ou que violem regras das plataformas.

### 4.11 Pedidos de oração e cuidado pastoral

Permita que uma pessoa envie um pedido de oração escolhendo a visibilidade:

- Somente equipe pastoral;
- Equipe de intercessão;
- Líder do Elo;
- Público no mural, após moderação;
- Anônimo para os demais usuários.

Campos:

- Categoria;
- Descrição;
- Urgência;
- Autorização para contato;
- Telefone;
- Responsável;
- Status;
- Histórico de acompanhamento.

Pedidos de oração, aconselhamento e observações pastorais devem ser tratados como informações altamente restritas.

Crie permissões específicas e logs de acesso para esses dados.

### 4.12 Doações, dízimos e ofertas

Planeje este módulo como segunda fase.

Funcionalidades futuras:

- Dízimo;
- Oferta;
- Campanha;
- Oferta missionária;
- Contribuição para ação social;
- PIX;
- Cartão;
- Boleto;
- Recorrência;
- Comprovante;
- Conciliação;
- Relatórios;
- Prestação de contas;
- Controle de acesso financeiro separado.

Somente perfis financeiros autorizados poderão acessar dados individualizados.

Líderes de Elo, supervisores e líderes de ministério não devem visualizar contribuições individuais.

### 4.13 Portal do membro

Crie uma área simples e acolhedora para o membro.

**Página inicial:**

- Saudação;
- Próximas programações;
- Estudo da semana;
- Avisos;
- Próximos eventos;
- Meu Elo;
- Meus ministérios;
- Pedidos de oração;
- Conteúdos recentes.

**Funcionalidades:**

- Meu perfil;
- Atualização cadastral;
- Minha carteirinha;
- Meu Elo;
- Solicitar participação em Elo;
- Inscrições;
- Ingressos;
- Meus cursos;
- Escalas;
- Pedidos de oração;
- Notificações;
- Política de privacidade;
- Solicitação de acesso, correção ou exclusão de dados.

## 5. MODELO DE DADOS INICIAL

Planeje as seguintes entidades:

Tenant; Congregation; User; Role; Permission; UserRole; Person; PersonContact; PersonAddress; PersonTag; PersonJourney; JourneyStage; FollowUpTask; PastoralNote; Elo; EloLeader; EloParticipant; EloRequest; EloMeeting; EloAttendance; EloReport; EloMultiplication; EloSupervisionVisit; WeeklyStudy; StudySection; StudyAttachment; Ministry; MinistryMember; VolunteerRole; VolunteerSchedule; Event; EventTicketType; EventRegistration; EventCheckIn; Announcement; Notification; PrayerRequest; Donation; Transaction; Consent; DataSubjectRequest; AuditLog; FileAttachment; SystemSetting.

Crie um diagrama ER antes de implementar o banco.

Cada tabela multi-tenant deverá possuir uma identificação segura do tenant ou congregação.

Não confie apenas nos filtros da interface. A separação deverá acontecer também no banco de dados e na camada de autorização.

Utilize:

- UUIDs;
- Datas de criação e atualização;
- Soft delete quando necessário;
- Histórico para dados críticos;
- Índices adequados;
- Restrições de integridade;
- Chaves estrangeiras;
- Controle de concorrência quando necessário.

## 6. STACK TÉCNICA

Antes de iniciar, verifique as versões estáveis atuais das ferramentas.

Utilize preferencialmente:

**Aplicação web**

- Next.js com App Router;
- TypeScript;
- React;
- Tailwind CSS;
- shadcn/ui;
- React Hook Form;
- Zod;
- TanStack Query quando necessário;
- PWA responsiva;
- Internacionalização preparada, iniciando em português brasileiro.

**Backend e banco**

- PostgreSQL;
- Supabase para banco, autenticação, storage e recursos em tempo real;
- Row Level Security;
- Server Actions ou camada de API claramente organizada;
- ORM ou query builder consistente, escolhendo entre Prisma ou Drizzle após justificar tecnicamente;
- Migrations versionadas;
- Seeds para ambiente de demonstração.

**Infraestrutura**

- Git;
- GitHub Actions;
- Vercel para frontend;
- Supabase para banco e autenticação;
- Monitoramento de erros;
- Logs estruturados;
- Backups;
- Ambientes separados de desenvolvimento, homologação e produção.

Evite dependências desnecessárias.

Não utilize bibliotecas abandonadas ou sem manutenção.

## 7. ARQUITETURA

Utilize arquitetura modular e escalável.

Organize o projeto por domínios:

auth; people; journey; elos; studies; events; ministries; communication; prayer; finance; reports; settings; audit.

Separe:

- Interface;
- Regras de negócio;
- Acesso a dados;
- Validação;
- Autorização;
- Integrações externas.

Crie componentes reutilizáveis, mas evite abstrações prematuras.

Não coloque regras de autorização apenas no frontend.

Toda ação sensível deverá ser validada no servidor.

## 8. LGPD E PRIVACIDADE

O sistema armazenará dados pessoais e dados relacionados à participação religiosa. Portanto, trate privacidade como requisito central.

Implemente:

- Política de privacidade;
- Termos de uso;
- Registro de consentimentos quando aplicável;
- Registro da finalidade do tratamento;
- Minimização de dados;
- Controle de acesso;
- Histórico de consentimentos;
- Exportação dos dados do titular;
- Correção cadastral;
- Solicitação de exclusão;
- Anonimização quando necessária;
- Política de retenção;
- Registro de incidentes;
- Logs de acesso;
- Criptografia em trânsito;
- Proteção de backups;
- Gestão de permissões;
- Expiração de links;
- URLs assinadas para arquivos privados.

Nunca coloque informações pessoais sensíveis:

- Em logs de aplicação;
- Em mensagens de erro;
- Em URLs públicas;
- Em analytics;
- Em notificações abertas;
- Em dados de demonstração.

Utilize dados fictícios nos seeds e testes.

Dados de crianças e adolescentes deverão possuir regras específicas de autorização e acesso.

Crie uma área para solicitações do titular dos dados.

Inclua documentação informando que a definição da base legal e das políticas internas deverá ser validada por profissional jurídico ou encarregado de proteção de dados.

## 9. EXPERIÊNCIA DO USUÁRIO

Priorize uso pelo celular.

Características:

- Botões grandes;
- Formulários curtos;
- Navegação clara;
- Textos simples;
- Boa acessibilidade;
- Contraste adequado;
- Feedback visual;
- Estados de carregamento;
- Estados vazios;
- Mensagens de erro compreensíveis;
- Salvamento automático quando apropriado;
- Confirmação antes de ações destrutivas;
- Uso de máscaras brasileiras;
- Datas em formato brasileiro;
- Horário no fuso da igreja;
- Moeda em real brasileiro;
- Telefones no padrão brasileiro;
- CEP no padrão brasileiro.

O relatório do Elo deve poder ser concluído rapidamente, mesmo por alguém com pouca familiaridade tecnológica.

## 10. TELAS DO MVP

Implemente inicialmente:

Login; Recuperação de senha; Dashboard; Lista de pessoas; Cadastro de pessoa; Perfil da pessoa; Jornada da pessoa; Lista de Elos; Perfil do Elo; Cadastro de Elo; Hierarquia de Elos; Participantes do Elo; Reuniões do Elo; Relatório semanal; Relatórios dos Elos; Estudos semanais; Cadastro de estudo; Eventos; Inscrições; Check-in; Ministérios; Pedidos de oração; Comunicados; Usuários e permissões; Configurações; Logs de auditoria; Portal do membro.

## 11. MVP PRIORITÁRIO

A primeira versão deverá priorizar:

**Prioridade 1**

- Autenticação;
- Usuários e permissões;
- Gestão de pessoas;
- Gestão de Elos;
- Hierarquia;
- Relatório semanal;
- Estudos semanais;
- Dashboard;
- Logs;
- LGPD básica.

**Prioridade 2**

- Jornada da pessoa;
- Eventos;
- Check-in;
- Ministérios;
- Comunicação;
- Pedidos de oração.

**Prioridade 3**

- Carteirinha;
- Notificações push;
- WhatsApp;
- Doações;
- Aplicativo nativo;
- Multi-congregação avançada;
- Recursos com inteligência artificial.

Não comece pelas funcionalidades financeiras.

## 12. RECURSOS FUTUROS COM INTELIGÊNCIA ARTIFICIAL

Prepare a arquitetura, mas não implemente recursos inseguros ou sem aprovação.

Possibilidades futuras:

- Transformar tópicos da pregação em estudo de Elo;
- Resumir relatórios;
- Identificar tendências de frequência;
- Sugerir pessoas que precisam de acompanhamento;
- Gerar mensagem para líderes;
- Criar resumo semanal para supervisores;
- Detectar dados duplicados;
- Classificar pedidos de oração;
- Transcrever pregações;
- Sugerir perguntas para o estudo.

Toda recomendação de IA deverá ser revisada por uma pessoa.

A IA não deverá tomar decisões pastorais automaticamente.

Não envie dados sensíveis a serviços externos sem autorização, contrato adequado e configuração explícita.

## 13. TESTES

Implemente:

- Testes unitários;
- Testes de integração;
- Testes de autorização;
- Testes de isolamento entre tenants;
- Testes de Row Level Security;
- Testes end-to-end dos fluxos principais;
- Testes de formulários;
- Testes de acessibilidade;
- Testes de recuperação de senha;
- Testes de exportação;
- Testes de auditoria.

Fluxos obrigatórios para testes end-to-end:

- Administrador cadastra uma pessoa;
- Coordenador cria um Elo;
- Supervisor visualiza apenas seus Elos;
- Líder envia relatório;
- Supervisor consulta relatório;
- Usuário sem permissão tenta acessar outro Elo;
- Visitante solicita participação;
- Líder aprova solicitação;
- Administrador publica estudo;
- Líder acessa estudo pelo celular;
- Pessoa solicita correção dos próprios dados;
- Administrador consulta log de alteração.

## 14. DOCUMENTAÇÃO OBRIGATÓRIA

Antes de desenvolver, crie:

- docs/PRD.md;
- docs/ARCHITECTURE.md;
- docs/DATABASE.md;
- docs/PERMISSIONS.md;
- docs/SECURITY.md;
- docs/LGPD.md;
- docs/ROADMAP.md;
- docs/USER_FLOWS.md;
- docs/DEPLOYMENT.md;
- docs/TESTING.md;
- .env.example;
- README.md.

O README deve explicar:

Objetivo; Stack; Pré-requisitos; Instalação; Configuração; Banco de dados; Seeds; Testes; Execução local; Deploy; Variáveis de ambiente; Segurança; Estrutura de diretórios.

## 15. DADOS DE DEMONSTRAÇÃO

Crie dados completamente fictícios:

- Uma congregação;
- Um pastor;
- Um coordenador;
- Dois supervisores;
- Quatro líderes;
- Quatro Elos;
- Vinte participantes;
- Cinco visitantes;
- Dois estudos;
- Dois eventos;
- Três ministérios;
- Alguns relatórios semanais;
- Alguns pedidos de oração fictícios e não sensíveis.

Nunca utilize dados reais da Igreja Renovo no repositório.

## 16. PADRÃO VISUAL

Crie um design system próprio.

Use:

- Verde como cor principal;
- Branco como base;
- Cinza claro para fundos;
- Tipografia legível;
- Cards com bordas suaves;
- Ícones simples;
- Espaçamento generoso;
- Menu responsivo;
- Dashboard moderno;
- Interface acolhedora.

Crie componentes para:

Botões; Campos; Seletores; Tabelas; Cards; Modais; Alertas; Indicadores; Gráficos; Avatares; Tags; Estados vazios; Skeleton loading; Confirmações; Paginação; Filtros.

Utilize a logomarca oficial da Igreja Renovo somente quando o arquivo for fornecido.

Até lá, utilize um placeholder claramente identificado.

## 17. REGRAS DE DESENVOLVIMENTO

Siga estas regras durante toda a execução:

- Antes de programar, analise o repositório.
- Não apague arquivos existentes sem justificar.
- Não sobrescreva configurações importantes sem verificar.
- Não exponha segredos.
- Não coloque chaves no código.
- Não desative regras de segurança para facilitar o desenvolvimento.
- Não use `any` sem justificativa.
- Valide entradas no cliente e no servidor.
- Trate erros adequadamente.
- Escreva código legível.
- Use nomes claros.
- Comente apenas decisões não óbvias.
- Execute lint, typecheck e testes após cada etapa.
- Corrija os erros antes de continuar.
- Crie commits pequenos e organizados.
- Não apresente protótipos como funcionalidades concluídas.
- Identifique claramente mocks e integrações pendentes.
- Não invente que uma integração está funcionando.
- Não utilize dados reais.
- Mantenha a documentação atualizada.

## 18. MÉTODO DE EXECUÇÃO

Trabalhe em etapas.

**Etapa 1 — Descoberta e planejamento**

- Analise este documento;
- Inspecione o repositório;
- Registre as premissas;
- Defina o MVP;
- Crie o PRD;
- Crie os fluxos;
- Defina a arquitetura;
- Modele o banco;
- Defina as permissões;
- Crie o roadmap;
- Liste riscos.

Não interrompa o trabalho por dúvidas pequenas. Adote uma decisão técnica segura, registre a premissa e continue.

Somente faça perguntas quando a resposta alterar profundamente: Segurança; Arquitetura; Custos; Escopo; Integração externa; Regras pastorais sensíveis.

**Etapa 2 — Fundação técnica**

Inicialize o projeto; Configure TypeScript; Configure lint; Configure formatação; Configure banco; Configure autenticação; Configure ambientes; Configure migrations; Configure seeds; Configure testes; Configure CI.

**Etapa 3 — Design system**

Crie tokens; Crie layout; Crie menu; Crie cabeçalho; Crie componentes; Garanta responsividade; Garanta acessibilidade.

**Etapa 4 — Módulos do MVP**

Implemente na seguinte ordem: Autenticação; Permissões; Pessoas; Elos; Hierarquia; Participantes; Relatórios semanais; Estudos; Dashboard; Auditoria; Privacidade.

**Etapa 5 — Qualidade**

Execute testes; Verifique permissões; Verifique RLS; Teste dispositivos móveis; Teste acessibilidade; Corrija vulnerabilidades; Atualize documentação.

**Etapa 6 — Entrega**

Apresente: O que foi concluído; O que está parcialmente concluído; O que não foi iniciado; Como executar; Como testar; Como publicar; Riscos; Próximos passos; Evidências dos testes executados.

## 19. PRIMEIRA TAREFA

Comece agora executando somente a fase de fundação e planejamento.

Sua primeira entrega deverá conter:

Resumo executivo do produto; Escopo do MVP; Lista de funcionalidades; Personas; Histórias de usuário; Matriz de permissões; Fluxos principais; Arquitetura proposta; Estrutura de pastas; Modelo de dados; Diagrama ER em Mermaid; Estratégia de segurança; Estratégia de LGPD; Roadmap por fases; Backlog priorizado; Critérios de aceite; Riscos técnicos; Estimativa de complexidade por módulo; Plano de testes; Plano de implantação.

Depois dessa documentação, inicialize a base técnica do projeto e implemente uma primeira versão funcional contendo:

Login; Dashboard inicial; Gestão básica de pessoas; Gestão básica de Elos; Controle inicial de permissões; Banco com migrations; Dados fictícios; Testes básicos; README completo.

Ao concluir cada etapa:

Informe os arquivos criados; Informe os arquivos alterados; Informe os comandos executados; Informe os testes realizados; Informe os resultados; Informe os problemas encontrados; Informe o próximo passo recomendado.

Construa uma base real, segura, organizada e preparada para evolução. Não entregue apenas telas estáticas.

---

**Como usar no Claude Code:** este arquivo é a especificação completa. O `CLAUDE.md` (na raiz) contém apenas as regras permanentes e aponta para cá. Antes de planejar qualquer fase, o Claude deve ler as seções relevantes deste documento.

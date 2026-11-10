# PersonalHUB — Plataforma Multi-Personal Trainer, Alunos & Gestão Financeira (PWA)

## 1. Perfis de Acesso (Salvos automaticamente no aparelho)
- **CEO (Admin Geral - Você)**: `ceo@personalhub.com` / `Admin@123` (acesso total: gerencia professores, financeiro dos professores e dos alunos sem personal, reajustes, treinos, alimentos e configurações)
- **Professores · Mini CEOs (Personal Trainers)**:
  - `carlos@personalhub.com` / `carlos123` (Em dia ✅)
  - `fernanda@personalhub.com` / `fernanda123` (Inadimplente 🚨)
  - `marcos@personalhub.com` / `marcos123` (A vencer ⏳)
- **Alunos Sem Personal (Pagam direto ao CEO)**:
  - `lucas@personalhub.com` / `lucas123` (Inadimplente 🚨)
  - `mariana@personalhub.com` / `mariana123` (Em dia ✅)
  - `pedro@personalhub.com` / `pedro123` (A vencer ⏳)
- **Alunos de Personal (Gerenciados pelo Professor Mini CEO)**:
  - `maria@personalhub.com` / `maria123` (Em dia ✅)
  - `joao@personalhub.com` / `joao123` (Inadimplente 🚨)
  - `bruna@personalhub.com` / `bruna123` (A vencer ⏳)
  - `ana@personalhub.com` / `ana123` (Em dia ✅)

## 2. Principais Funções
- **Módulo Financeiro Completo & Inadimplência**:
  - **Visão do CEO**: controla na aba **Financeiro** os **Professores (Mini CEOs)** que já pagaram ou ainda irão pagar, bem como os **Alunos Sem Personal** que pagam a mensalidade diretamente sem precisar de personal.
  - **Visão do Professor (Mini CEO)**: ao cadastrar o professor, ele atua como um Mini CEO com acesso aos seus alunos, controle de cadastrar novos alunos e aba **Financeiro** exclusiva para ver quem já pagou, quem ainda falta pagar, datas a vencer e inadimplentes.
  - **Reajustes de Mensalidades**: reajuste individual (com botões rápidos de `+5%`, `+10%`, `+15%`, `+20%`, `-10%`) ou **Reajuste em Lote** (por `%`, acréscimo em `R$` ou novo valor fixo) para Professores, Alunos Sem Personal ou Alunos do Professor.
  - **Baixa de Pagamento e Cobrança 1-Clique**: botão para confirmar pagamento e avançar vencimento para o próximo ciclo, além de cobrança pronta via WhatsApp ou notificação interna no app.
- **Mesma Implementação Mobile e Desktop + Contas Salvas**: layout responsivo unificado para celulares e computadores, persistência dupla (`localStorage` + `IndexedDB` + suporte a `Supabase`) e acesso rápido às contas salvas na tela de login.
- **Exportar e Importar Treinos via Documento**: no Editor de Treinos, exporte a ficha em `.json`, `.txt` ou PDF/Impressão, e importe treinos prontos via arquivo `.json` ou `.txt`.
- **Scanner de Calorias por Câmera**: na aba **Estudo**, o botão **"📸 Saiba quanto de caloria está comendo agora"** abre a câmera do celular, tira a foto da refeição e calcula automaticamente o valor aproximado de calorias, proteínas, carboidratos e gorduras.
- **Cálculo Automático ao Digitar Alimento**: basta escrever o nome do alimento (ex.: `amendoim` ou `amendoim 50g`) na aba Estudo para o app calcular sozinho na mesma hora.
- **Módulo InBody 770, Dobras Cutâneas & Gráficos Antropométricos (`inbody.html`)**:
  - **Laudo InBody 770 Clínica Experience**: 4 gráficos SVG empilhados idênticos ao laudo oficial (Peso, MME, PGC e Taxa de AEC) desenhados em tempo real ao editar a tabela de histórico.
  - **Análise Músculo-Gordura & Obesidade**: barras horizontais com faixas de referência (Abaixo, Normal, Acima) e tabela detalhada de composição (Água Corporal, FFM, BMR, RCQ, Gordura Visceral, IMLG/FFMI).
  - **Análise Segmentar & Impedância Z(Ω)**: Massa Magra e Gordura por membro (Braços, Tronco e Pernas) e tabela de impedância multi-frequência (1 kHz a 1000 kHz).
  - **Dobras Cutâneas & Adipômetro 3x**: protocolos Pollock 3 e 7 dobras + Equação de Siri, com modo "3x Média" para calcular a média de 3 pinçadas por dobra e gráfico antropométrico de queda do Σ dobras (mm) e cintura.
  - **Perimetria & Detector de Assimetria**: medidas corporais com alerta visual automático quando houver assimetria bilateral $\ge 1,5\text{ cm}$.
  - **Acesso Integrado no App**: disponível na barra lateral (`InBody & Dobras`), no menu "Mais ⋯", na sub-navegação da aba Treinos e no menu de ações rápidas de cada aluno, além de poder ser aberto diretamente pelo arquivo `inbody.html`.

## 3. Como Abrir no Computador
Dê dois cliques em `ABRIR-APP.bat` (que abre `http://localhost:8080`).

## 4. Como Publicar no Netlify
Arraste a pasta do projeto (ou o arquivo `personalhub-netlify.zip` extraído) para o painel da Netlify (**Add new site → Deploy manually**).

## 5. Como Publicar no Render & Ativar Atualizações em Tempo Real

### Passo 1: Subir o Projeto para o GitHub
1. Crie um repositório no seu GitHub (ex.: `personalhub`).
2. Faça upload de todos os arquivos desta pasta para a branch principal (`main`).

### Passo 2: Criar o Static Site no Render
1. Acesse **[render.com](https://render.com)** e faça login com sua conta do GitHub.
2. Clique no botão **New +** e selecione **Static Site**.
3. Conecte o repositório do GitHub (`personalhub`).
4. Preencha os campos:
   - **Name:** `personalhub` (ou o nome que preferir)
   - **Branch:** `main`
   - **Build Command:** Deixe em branco
   - **Publish Directory:** `.` (ponto)
5. Clique em **Create Static Site**.
6. Em segundos o Render gera o link HTTPS gratuito (ex.: `https://personalhub.onrender.com`).

### Passo 3: Como Funcionam as Atualizações em Tempo Real
1. **Atualizações de Código (Deploy Contínuo no Render):**
   - O Render possui **Auto-Deploy** automático. Sempre que você alterar um arquivo (`app.js`, `styles.css`, etc.) e enviar para o GitHub, o Render atualiza o site no ar instantaneamente.
   - O Service Worker (`sw.js`) com cache versionado atualiza automaticamente o app nos celulares e computadores de todos os usuários.
2. **Atualizações de Treinos, Cargas e Alunos em Tempo Real (Professor ↔ Aluno):**
   - Para que o professor no PC altere um treino e o aluno veja na hora no celular pela internet (e vice-versa para cargas e repetições), configure o banco na nuvem **Supabase**:
     - Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` no arquivo `config.js` (ou use o botão "Conectar Nuvem" na tela inicial).
     - No **SQL Editor** do Supabase, execute o script `supabase/schema.sql`. Ele já contém as publicações do Realtime ativadas (`workouts`, `profiles`, `settings`, `messages`).
     - Pronto! A sincronização funciona em tempo real por WebSockets sem recarregar a tela.

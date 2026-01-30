# Consórcio Intel - Market Intelligence Platform

Plataforma de inteligência de mercado desenvolvida para administradoras de consórcio, oferecendo dashboards estratégicos, análise competitiva e insights preditivos via IA.

## 🚀 Funcionalidades

- **Visão Geral**: KPIs de receita, cotas, inadimplência e contemplações.
- **Ingestão de Dados**: Importação inteligente de CSV com detecção automática de layout.
- **Posicionamento Competitivo**: Gráficos de Radar e Market Share comparativo.
- **Tendências de Mercado**: Séries históricas e predição de demanda futura com IA.
- **Análise Regional**: Mapa de calor e oportunidades por UF/Região.
- **Integração IA**: Utiliza Google Gemini para gerar insights estratégicos sobre os dados.

## 🛠️ Tecnologias

- **Frontend**: React 19, Vite, TypeScript
- **Estilização**: Tailwind CSS
- **Gráficos**: Recharts
- **IA**: Google Gemini API (@google/genai)
- **Ícones**: Lucide React

## 📦 Como rodar localmente

1. Clone o repositório
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env` na raiz com sua chave da API:
   ```env
   API_KEY=sua_chave_do_google_ai_studio
   ```
4. Rode o projeto:
   ```bash
   npm run dev
   ```

## ☁️ Deploy (Firebase & GitHub Actions)

Este projeto está configurado para deploy automático via GitHub Actions para o Firebase Hosting.

### Configuração no Novo Repositório

Se você mudou de repositório, lembre-se de configurar as **Secrets** novamente no GitHub (Settings > Secrets and variables > Actions):

1. `API_KEY`: Sua chave do Gemini (AI Studio).
2. `FIREBASE_SERVICE_ACCOUNT_CONSORCIO_INTEL`: O JSON da conta de serviço do Firebase (necessário para o Github Action fazer o deploy).

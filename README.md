# Imaginário Premium (Next.js + Supabase + OpenAI)

App completo para **gerar** e **editar** imagens com IA, com **login**, **dashboard**, **histórico** e integração com **Supabase Storage**.
Pronto para hospedar no **Vercel** e versionar no **GitHub**.

## ✅ Requisitos
- Node.js 18+
- Conta no Supabase
- Chave da OpenAI (Images)

## 1) Rodar local
```bash
npm install
cp .env.example .env
npm run dev
```

## 2) Variáveis de ambiente
Edite `.env` (local) e depois copie as mesmas variáveis para o Vercel.

Obrigatórias:
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Recomendadas (para upload no Storage e log no banco via backend):
- `SUPABASE_SERVICE_ROLE_KEY`

> Sem `SUPABASE_SERVICE_ROLE_KEY`, o app ainda funciona, mas retorna as imagens em **base64** (sem salvar no Storage).

## 3) Configurar Supabase
### (A) Banco: tabela de histórico
Abra **SQL Editor** e rode:
- `supabase/schema.sql`

### (B) Storage
Crie um bucket chamado:
- `imaginario`

Recomendado para começar: **PUBLIC**  
(Depois você pode migrar para PRIVATE + Signed URLs.)

## 4) Deploy no Vercel
- Importe o repositório do GitHub no Vercel
- Configure as env vars (iguais do `.env`)
- Deploy ✅

## Rotas do backend (já prontas)
- `POST /api/image/generate` (JSON)
- `POST /api/image/edit` (multipart/form-data)

## Notas de produção
- Se você quiser **limites por plano**, checkout e painel admin, este projeto já está estruturado para receber isso no próximo passo.
- Para reduzir custos, implemente rate-limit e contagem por usuário/assinatura.

---
Feito para você colar no Vercel e funcionar com o mínimo de dor.

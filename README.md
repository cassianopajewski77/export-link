# Export Link – Export Docs Pro online

Versão online do Gerador de Proforma / Invoice / Packing List da Kapazi.
Banco, login e arquivos no **Supabase**; site no **Cloudflare Pages**.

## Como funciona
- `original/Gerador de Proforma.html` é o mesmo gerador do PC (fonte).
- `node ferramentas/montar_gerador.js` gera `web/gerador.html` a partir dele: tira os arquivos de dados
  (`dados.js`, cadastros, embalagens), tira os dados bancários do código e liga a ponte.
- `web/ponte.js` faz o papel do ajudante do PC (`servidor.ps1`):
  - exige login e só libera quem está na tabela `membros`;
  - lê clientes, produtos, tabela de preço, embalagens e dados do exportador do banco;
  - as gravações/leituras de pasta (`/api/info`, `mkdir`, `listar`, `ler`, `salvar`) vão para o
    Storage (bucket `arquivos`) com os mesmos caminhos do PC (`Clientes/<cód - nome>/<nº>/...`);
  - espelha nas tabelas `documentos`, `clientes`, `produtos`, `arquivos` e `configuracoes` o que é gravado.
- `functions/api/foto.js` (Cloudflare Pages Function) busca as fotos do site (SKUImagens) para o gerador.
- `web/index.html` é a tela de login.

O PDF automático pelo Excel não existe na versão online: use **PDF / Imprimir > Salvar como PDF**.
O Excel continua sendo gerado e salvo na pasta do cliente.

## Banco (Supabase > SQL Editor), na ordem
1. `supabase/01_esquema.sql` – tabelas, RLS, buckets
2. `supabase/02_carga_base.sql` – carga da base do PC (`node ferramentas/gerar_carga.js <pasta> <sku.json>` gera de novo)
3. `supabase/03_liberar_usuarios.sql` – libera os usuários criados em Authentication > Users
4. `supabase/04_ajustes_app.sql` – ajustes usados pelo app (número do documento, cliente e proforma automáticos)

## Publicar no Cloudflare Pages
1. Cloudflare > **Workers & Pages** > **Create** > aba **Pages** > **Connect to Git** (Import an existing Git repository).
2. Escolha o repositório `export-link` > **Begin setup**.
3. Framework preset: **None** · Build command: *(vazio)* · Build output directory: **web**.
4. **Save and Deploy**. O endereço fica `https://export-link.pages.dev` (ou parecido).
5. A cada push no `main` o site é publicado de novo.

## Teste local (sem internet, com Supabase falso)
```
node ferramentas/gerar_carga.js "<pasta Gerador de Proforma>" <sku.json> --semente /tmp/semente.json
SEMENTE=/tmp/semente.json LIBS=<pasta com exceljs/dist> node testes/teste_ponte.js
```

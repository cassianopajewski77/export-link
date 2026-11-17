# Export Link – Export Docs Pro online

Versão online do Gerador de Proforma / Invoice / Packing List da Kapazi.
Banco, login e arquivos no **Supabase**; site no **Cloudflare Workers** (arquivos estáticos de `web/`).

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
- `worker/index.js` (Cloudflare Worker, configurado em `wrangler.jsonc`) serve a pasta `web/` e busca as fotos do site (SKUImagens) em `/api/foto`.
- `web/index.html` é a tela de login (Entrar, Primeiro acesso, Esqueci a senha).
- `web/empresa.js` tem as telas da empresa: Cadastro do exportador (botão **Exportador**), **Usuários** (administrador
  da empresa) e **Empresas** (administrador da plataforma Export Link).

## Multiempresa (script 07)
O sistema é da Export Link e atende várias **empresas exportadoras**. Cada empresa tem os seus usuários, clientes,
produtos, tabela de preço, documentos e arquivos, separados pelo banco (RLS): uma empresa nunca vê dados de outra.
- **Empresa** (`empresas`): razão social, CNPJ, IE, RADAR, endereço, contato, logo (Storage `arquivos/<id>/_empresa/logo.png`),
  contas bancárias (a primeira é a padrão, sai na proforma e na invoice), prefixo da numeração e padrões.
- **Usuários** (`membros`): cada e-mail pertence a **uma** empresa, com papel `admin`, `usuario` ou `consulta`.
  O administrador inclui o e-mail na tela Usuários; a pessoa abre o site, clica em **Primeiro acesso** e cria a senha.
- **Plataforma** (`plataforma_admins`): cria empresas novas (tela Empresas) e entra em qualquer uma para suporte.
- **Arquivos**: ficam em `arquivos/<id da empresa>/Clientes/...`. Os arquivos antigos da Kapazi ficam onde estavam até o
  administrador clicar em **Migrar arquivos** (uma vez só).
- No navegador, rascunhos e números ficam separados por empresa (a Kapazi mantém os nomes antigos).
- A Kapazi é a primeira empresa (id `4b415a49-0000-4000-8000-000000000001`, slug `kapazi`); só ela usa as fotos de
  produto `fotos.js`/`fotos_catalogo.js` e o logo antigo `logo.js` (até subir um logo no cadastro).

### Supabase > Authentication (uma vez)
- **Sign In / Providers > Email**: deixar *Allow new users to sign up* ligado (é o Primeiro acesso; quem não está em
  Usuários entra mas não vê nada).
- **URL Configuration**: *Site URL* = endereço do site; em *Redirect URLs* incluir `https://<site>/index.html`
  (links de confirmação de e-mail e de Esqueci a senha).

O PDF automático pelo Excel não existe na versão online: use **PDF / Imprimir > Salvar como PDF**.
O Excel continua sendo gerado e salvo na pasta do cliente.

## Banco (Supabase > SQL Editor), na ordem
1. `supabase/01_esquema.sql` – tabelas, RLS, buckets
2. `supabase/02_carga_base.sql` – carga da base do PC (`node ferramentas/gerar_carga.js <pasta> <sku.json>` gera de novo)
3. `supabase/03_liberar_usuarios.sql` – libera os usuários criados em Authentication > Users
4. `supabase/04_ajustes_app.sql` – ajustes usados pelo app (número do documento, cliente e proforma automáticos)
5. `05_pedido_cliente.sql` e `06_fotos_pedido.sql` – site de pedidos da Kapazi (estão no repositório kapazi-pedidos)
7. `supabase/07_multiempresa.sql` – empresas, usuários com papel, separação por empresa, Kapazi como primeira empresa.
   Rode e publique o site novo logo em seguida (o site antigo não grava depois do 07).

## Publicar no Cloudflare
O projeto Workers `export-link` está ligado a este repositório: a cada push no `main` o Cloudflare roda
`npx wrangler deploy` na raiz, que lê o `wrangler.jsonc` (arquivos de `web/` + `worker/index.js`).
Configuração no painel: Build command vazio · Deploy command `npx wrangler deploy` · Root directory `/`.

## Endereço próprio: app.exportlink.com.br
O sistema fica em **https://app.exportlink.com.br** (o endereço antigo `export-link.cassiano-pajewski.workers.dev`
continua funcionando). O código não tem endereço fixo: login, confirmação de e-mail e Esqueci a senha usam o
endereço em que a página foi aberta, então nada muda no código.
- **Cloudflare** > Workers & Pages > `export-link` > Settings > Domains & Routes > Add > **Custom domain** >
  `app.exportlink.com.br`. A Cloudflare cria o DNS e o certificado HTTPS sozinha (o domínio já está na conta).
- **Supabase** > Authentication > URL Configuration: *Site URL* = `https://app.exportlink.com.br`;
  *Redirect URLs*: `https://app.exportlink.com.br/**` e, durante a transição, `https://export-link.cassiano-pajewski.workers.dev/**`.
- O site da empresa (repositório exportlink-site) tem o botão **Entrar** no menu e nas páginas do Export Link Docs
  apontando para cá.

## Teste local (sem internet, com Supabase falso)
```
SEMENTE=/tmp/semente.json LIBS=<pasta com exceljs/dist> node testes/teste_ponte.js
```
A semente é um JSON `{tabelas:{empresas, membros, plataforma_admins, clientes, produtos, tabelas_preco, precos, documentos, ...}}`:
o export das tabelas de um Postgres local depois dos scripts 01 a 07 (por exemplo com `json_agg` de cada tabela).
O teste cobre login, proforma, Storage, cadastro do exportador, Migrar arquivos, Usuários, Empresas e uma segunda
empresa que não enxerga nada da Kapazi.

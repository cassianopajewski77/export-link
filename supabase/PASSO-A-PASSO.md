# Export Link – montar o banco no Supabase (etapa 1)

São 4 arquivos SQL nesta pasta (o 04 veio com o app online). Rode na ordem. Leva uns 10 minutos.
Nunca envie no chat a chave `service_role` nem a senha do banco.

## 1. Criar as tabelas (01_esquema.sql)
1. Abra https://supabase.com/dashboard e entre no projeto.
2. No menu da esquerda, clique em **SQL Editor**.
3. Clique em **+ New query** (ou "New SQL snippet").
4. Abra o arquivo `01_esquema.sql`, copie tudo (Ctrl+A, Ctrl+C) e cole no editor.
5. Clique em **Run** (ou Ctrl+Enter).
6. Embaixo deve aparecer: `Esquema criado com sucesso`.
   Se aparecer um aviso "destructive operation" ou "RLS", clique em **Run this query** para confirmar.

## 2. Carregar a base atual (02_carga_base.sql)
1. Ainda no SQL Editor, clique em **+ New query**.
2. Abra `02_carga_base.sql` (arquivo grande, ~480 KB), copie tudo e cole.
3. Clique em **Run**. Pode levar alguns segundos.
4. O resultado deve mostrar: **227 clientes, 910 produtos, 973 linhas de preço,
   759 produtos com foto do site, 4 documentos** (KZSS-001/26 + invoice, KZCI-002/26, KZWA-003/26).

## 3. Bloquear cadastro público e criar os 2 usuários
1. Menu **Authentication** > **Sign In / Providers** (em algumas versões: Providers > Email).
   - Deixe **Email** ligado.
   - Desligue **Allow new users to sign up** e clique em **Save**.
     (Assim ninguém de fora consegue criar conta.)
2. Menu **Authentication** > **Users** > botão **Add user** > **Create new user**.
   - E-mail e senha de você. Marque **Auto Confirm User**. Clique **Create user**.
   - Repita para a assistente.

## 4. Liberar o acesso (03_liberar_usuarios.sql)
1. SQL Editor > **+ New query**, cole o `03_liberar_usuarios.sql` e clique **Run**.
2. Devem aparecer os 2 e-mails. Só quem está nessa lista vê os dados
   (mesmo logado, um e-mail fora da lista não vê nada).

## 4b. Ajustes do app (04_ajustes_app.sql)
SQL Editor > **+ New query**, cole o `04_ajustes_app.sql` e clique **Run**. Deve aparecer `Ajustes aplicados`.

## 5. Conferir
- Menu **Table Editor**: devem aparecer as tabelas `clientes`, `produtos`, `precos`,
  `tabelas_preco`, `documentos`, `arquivos`, `de_para`, `embalagens`, `configuracoes`, `membros`.
- Menu **Storage**: devem aparecer os buckets `fotos` e `arquivos` (privados).

Pronto. Me avise no chat ("rodei os 3") e eu sigo para o app online.

---

### O que tem no banco
| Tabela | Conteúdo |
|---|---|
| `clientes` | base oficial (lista clientes expo) + cadastrados/editados no gerador |
| `produtos` | um registro por código (tabela de preço + produtos manuais), link da foto do site |
| `tabelas_preco` / `precos` | a tabela de preço com todas as linhas (a planilha tem códigos repetidos com preços diferentes; a busca usa a primeira linha, como hoje). Cada atualização vira uma nova versão |
| `embalagens` | base de embalagens do packing list (hoje vazia, igual ao embalagens.js) |
| `de_para` | código do cliente → código Kapazi, por cliente ou geral (vazia, para quando retomarmos o tema) |
| `documentos` | proformas, invoices, packing lists e simulações de formação de preço, com o mesmo conteúdo dos `dados_*.json` |
| `arquivos` | PDFs/Excel gerados, pedido do cliente, documentos do cliente, fichas técnicas (os arquivos ficam no Storage) |
| `configuracoes` | dados do exportador e dados bancários |
| `membros` | e-mails com acesso |

Fotos: as do site já estão ligadas (link). As fotos coladas no base_fotos.xlsx, as do modelo
e do catálogo vão para o bucket `fotos` na próxima etapa, por um botão de importação no app
(precisa estar logado, por isso não dá para fazer só com SQL).

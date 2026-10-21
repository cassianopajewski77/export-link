// Cloudflare Pages Function: /api/foto?url=...
// Baixa a foto do produto do site (SKUImagens.xlsx) e devolve para o gerador, que não
// consegue ler direto do digitaloceanspaces por causa do CORS. Mesma regra do ajudante do PC:
// só https e só *.digitaloceanspaces.com.
export async function onRequestGet({request}){
  const alvo = new URL(request.url).searchParams.get("url") || "";
  let u;
  try{ u = new URL(alvo); }catch(e){ return new Response("endereço inválido", {status:400}); }
  if(u.protocol !== "https:" || !u.hostname.endsWith(".digitaloceanspaces.com")) return new Response("endereço de foto não permitido", {status:400});
  const r = await fetch(u.toString(), {cf:{cacheTtl:86400 * 30, cacheEverything:true}});
  if(!r.ok) return new Response("foto não encontrada", {status:r.status});
  const tipo = r.headers.get("Content-Type") || "image/jpeg";
  if(!tipo.startsWith("image/")) return new Response("não é imagem", {status:415});
  return new Response(r.body, {headers:{"Content-Type":tipo, "Cache-Control":"public, max-age=2592000"}});
}

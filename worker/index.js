// Cloudflare Worker do Export Link. Os arquivos do site (pasta web/) são servidos direto
// pelo Cloudflare (static assets); este código só roda para endereços que não são arquivos:
//   /api/foto?url=...   foto do produto do site (SKUImagens.xlsx), que o navegador não consegue
//                       ler direto do digitaloceanspaces por causa do CORS.
//                       Mesma regra do ajudante do PC: só https e só *.digitaloceanspaces.com.
//   /api/cotacao        dólar e euro em reais (AwesomeAPI, grátis e sem chave; reserva: open.er-api.com).
//   /api/noticias?q=... notícias de comércio exterior (RSS do Google Notícias, em português).
//   /api/youtube?canal= últimos vídeos de um canal do YouTube (feed público, sem chave);
//                       aceita o @nome do canal ou o id que começa com UC.
// Cotação e notícias ficam em cache no Cloudflare (5 e 30 minutos) para não depender
// de cada acesso nem estourar o limite das fontes gratuitas.
const json = (obj, segundos, status = 200) => new Response(JSON.stringify(obj), {status, headers:{
  "Content-Type":"application/json; charset=utf-8", "Cache-Control":`public, max-age=${segundos}`}});

async function comCache(request, ctx, segundos, gerar){
  const cache = caches.default, chave = new Request(new URL(request.url).toString(), {method:"GET"});
  const salvo = await cache.match(chave);
  if(salvo) return salvo;
  const r = await gerar();
  if(r.status === 200 && ctx) ctx.waitUntil(cache.put(chave, r.clone()));
  return r;
}

async function cotacao(){
  try{
    const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL", {headers:{"User-Agent":"export-link"}});
    if(!r.ok) throw new Error("awesomeapi " + r.status);
    const d = await r.json(), m = x => x && {compra:+x.bid, venda:+x.ask, variacao:+x.pctChange, hora:+x.timestamp * 1000};
    if(!d.USDBRL) throw new Error("sem USDBRL");
    return json({fonte:"AwesomeAPI", usd:m(d.USDBRL), eur:m(d.EURBRL)}, 300);
  }catch(e){
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if(!r.ok) return json({erro:"cotação indisponível"}, 60, 502);
    const d = await r.json(), brl = d.rates && d.rates.BRL, eur = d.rates && d.rates.EUR;
    if(!brl) return json({erro:"cotação indisponível"}, 60, 502);
    const hora = (d.time_last_update_unix || 0) * 1000;
    return json({fonte:"ExchangeRate-API", usd:{venda:brl, hora}, eur:eur ? {venda:brl / eur, hora} : null}, 300);
  }
}

const desfazer = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&").trim();
const tag = (xml, nome) => { const m = xml.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`)); return m ? desfazer(m[1]) : ""; };

async function noticias(url){
  const q = (url.searchParams.get("q") || "exportação OR \"comércio exterior\"").slice(0, 200);
  const rss = "https://news.google.com/rss/search?hl=pt-BR&gl=BR&ceid=BR:pt-419&q=" + encodeURIComponent(q + " when:7d");
  const r = await fetch(rss, {headers:{"User-Agent":"Mozilla/5.0 (export-link)"}});
  if(!r.ok) return json({erro:"notícias indisponíveis"}, 60, 502);
  const xml = await r.text(), itens = [];
  for(const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)){
    const it = m[1], fonte = tag(it, "source");
    let titulo = tag(it, "title");
    if(fonte && titulo.endsWith(" - " + fonte)) titulo = titulo.slice(0, -(fonte.length + 3));
    const link = tag(it, "link");
    if(!titulo || !/^https:\/\//.test(link)) continue;
    itens.push({titulo, link, fonte, data:Date.parse(tag(it, "pubDate")) || 0});
    if(itens.length >= 8) break;
  }
  return json({itens}, 1800);
}

async function youtube(url){
  let canal = (url.searchParams.get("canal") || "").trim(), id = "";
  const m = canal.match(/(UC[\w-]{22})/), h = canal.match(/@([\w.\-]{3,40})/);
  if(m) id = m[1];
  else if(h){   // @nome: descobre o id na página do canal
    const r = await fetch("https://www.youtube.com/@" + h[1], {headers:{"User-Agent":"Mozilla/5.0", "Accept-Language":"pt-BR"}});
    const html = r.ok ? await r.text() : "";
    const a = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) || html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/);
    if(a) id = a[1];
  }
  if(!id) return json({erro:"canal não encontrado"}, 300, 404);
  const r = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + id);
  if(!r.ok) return json({erro:"canal indisponível"}, 300, 502);
  const xml = await r.text(), videos = [];
  for(const e of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)){
    const v = tag(e[1], "yt:videoId");
    if(/^[\w-]{11}$/.test(v)) videos.push({id:v, titulo:tag(e[1], "title"), data:Date.parse(tag(e[1], "published")) || 0});
    if(videos.length >= 5) break;
  }
  return json({canal:id, videos}, 3600);
}

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if(url.pathname === "/api/cotacao") return comCache(request, ctx, 300, cotacao);
    if(url.pathname === "/api/youtube") return comCache(request, ctx, 3600, () => youtube(url));
    if(url.pathname === "/api/noticias") return comCache(request, ctx, 1800, () => noticias(url));
    if(url.pathname !== "/api/foto") return env.ASSETS.fetch(request);
    let u;
    try{ u = new URL(url.searchParams.get("url") || ""); }catch(e){ return new Response("endereço inválido", {status:400}); }
    if(u.protocol !== "https:" || !u.hostname.endsWith(".digitaloceanspaces.com")) return new Response("endereço de foto não permitido", {status:400});
    const r = await fetch(u.toString(), {cf:{cacheTtl:86400 * 30, cacheEverything:true}});
    if(!r.ok) return new Response("foto não encontrada", {status:r.status});
    const tipo = r.headers.get("Content-Type") || "image/jpeg";
    if(!tipo.startsWith("image/")) return new Response("não é imagem", {status:415});
    return new Response(r.body, {headers:{"Content-Type":tipo, "Cache-Control":"public, max-age=2592000"}});
  }
};

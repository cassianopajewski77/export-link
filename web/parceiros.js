/* =====================================================================
   TELA DE ENTRADA (index.html) – o que aparece em volta do quadro de login.
   Para mudar, edite só este arquivo (no GitHub: abrir o arquivo > lápis > Commit).

   PARCEIROS: cada parceiro é um bloco { ... }. Campos:
     nome   – nome do parceiro (obrigatório)
     texto  – frase curta (até uns 90 caracteres)
     link   – endereço que abre ao clicar (opcional)
     imagem – logo/banner: endereço https://... ou arquivo na pasta web/parceiros/ (opcional)
     cor    – cor de fundo do cartão quando não tem imagem (opcional, ex.: "#0A2540")
   Se tiver mais de um parceiro, eles se revezam a cada 8 segundos.
   Para tirar um parceiro, apague o bloco inteiro (do { até o },).
   ===================================================================== */
window.TELA_ENTRADA = {
  // O que aparece na tela (true = aparece, false = escondido)
  mostrar: {
    dolar: true,
    euro: false,
    noticias: true,
    whatsapp: true,
    parceiros: false,
    youtube: false
  },

  parceiros: [
    {
      nome: "Export Link Global Solutions",
      texto: "Consultoria em comércio exterior, treinamentos e documentos de exportação.",
      link: "https://exportlink.com.br",
      cor: "#0A2540"
    },
    {
      nome: "Seja um parceiro Export Link",
      texto: "Sua marca aqui, vista todos os dias por exportadores. Fale com a gente.",
      link: "https://exportlink.com.br/contato/",
      cor: "#FF6B00"
    }
  ],

  // Suporte pelo WhatsApp: número com país e DDD, só números (55 + DDD + número)
  whatsapp: "5541992640066",
  whatsappMensagem: "Olá! Preciso de ajuda com o Export Docs Pro.",

  // YouTube: coloque o endereço do canal em "canal" (ex.: "https://www.youtube.com/@exportlink").
  // Os vídeos novos aparecem sozinhos (o mais recente primeiro, com setas para ver os anteriores);
  // o sistema confere o canal a cada hora, não precisa mexer aqui quando lançar vídeo novo.
  // "videos" é opcional: só use se quiser fixar vídeos específicos no lugar dos mais recentes.
  // Ex.: videos: ["https://www.youtube.com/watch?v=XXXXXXXXXXX"]. Sem canal e sem vídeos = "Em breve".
  youtube: {
    videos: [],
    canal: ""
  },

  // Notícias: assunto pesquisado no Google Notícias (separe as palavras com OR)
  noticias: "exportação OR \"comércio exterior\" OR exportações OR \"balança comercial\""
};

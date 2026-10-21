// Gerado por ferramentas/montar_gerador.js a partir do gerador (não edite à mão).
"use strict";
const UM_ES = {PC:"PIEZA", RL:"ROLLO", UN:"UNIDAD", MT:"METRO", M2:"M²", KT:"KIT", CX:"CAJA", LT:"LATA"};
const norm = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
const r2 = n => Math.round((Number(n)||0)*100)/100;
/* ---------- tradução PT -> ES (dicionário simples; a descrição continua editável) ---------- */
const DIC = [
  ["TAPETE DE BANHEIRO","ALFOMBRA DE BAÑO"],["TOALHA DE MESA","MANTEL"],["GRAMA SINTETICA","CÉSPED SINTÉTICO"],
  ["PISO VINILICO","PISO VINÍLICO"],["PISO LAMINADO VINILICO","PISO LAMINADO VINÍLICO"],["PROTEPISO FLEXIVEL","PROTECTOR DE PISO FLEXIBLE"],
  ["PROTEPISO","PROTECTOR DE PISO"],["FIBRA DE COCO","FIBRA DE COCO"],["BEM VINDOS","BIENVENIDOS"],["BEM VINDO","BIENVENIDO"],
  ["HORA DO LANCHE","HORA DE LA MERIENDA"],["CAFE EXPRESSO","CAFÉ EXPRESO"],["BASE FUNDIDA","BASE FUNDIDA"],["BORDA REBAIXADA","BORDE REBAJADO"],
  ["AZUL MARINHO","AZUL MARINO"],["SEM RESINA","SIN RESINA"],["EM ROLO","EN ROLLO"],["EM PLACA","EN PLACA"],["EM REGUA","EN REGLA"],["P/ CORTE","P/ CORTE"],
  ["PASSADEIRA","CAMINO"],["CAPACHO","ALFOMBRA DE ENTRADA"],["TAPETE","ALFOMBRA"],["YOGAKAP","ESTERILLA DE YOGA YOGAKAP"],
  ["VINIL","VINÍLICA"],["PINTADO","PINTADA"],["CONECTADO","CONECTADA"],["PERSONALIZADO","PERSONALIZADA"],["TECIDO","TEJIDO"],
  ["MOLDURA","CON MARCO"],["MADEIRA","MADERA"],["FLEXIVEL","FLEXIBLE"],["LAMINADO","LAMINADO"],["LISO","LISO"],
  ["OURO","ORO"],["PRATA","PLATA"],["BEGE","BEIGE"],["CINZA","GRIS"],["PRETO","NEGRO"],["PRETA","NEGRA"],["BRANCO","BLANCO"],["BRANCA","BLANCA"],
  ["VERMELHO","ROJO"],["VERMELHA","ROJA"],["AMARELO","AMARILLO"],["AMARELA","AMARILLA"],["MARROM","MARRÓN"],["LARANJA","NARANJA"],["ROSA BEBE","ROSA BEBÉ"],
  ["GRAFITE","GRAFITO"],["CIMENTO","CEMENTO"],["LINHO","LINO"],["TRIANGULOS","TRIÁNGULOS"],["ARABE","ÁRABE"],["MARMORE","MÁRMOL"],["BAMBU DE JARDIM","BAMBÚ DE JARDÍN"],
  ["JARDIM","JARDÍN"],["FOLHAGEM","FOLLAJE"],["GEOMETRICO","GEOMÉTRICO"],["LISTRAS","RAYAS"],["POAS","LUNARES"],["TEXTURIZADOS","TEXTURIZADOS"],
  ["CACHORRO","PERRO"],["DOG","PERRO"],["CAT","GATO"],["DONDE ESTA MI COMIDA","¿DÓNDE ESTÁ MI COMIDA?"],["TENGO HAMBRE","¡TENGO HAMBRE!"],
  ["REDONDO","REDONDO"],["TINTA","PINTURA"],["CAIXA","CAJA"],["MAQUINA","MÁQUINA"],["REBAIXO","REBAJE"],["DE PINTURA PARA","DE PINTURA PARA"],
  ["AEROGRAFOS","AERÓGRAFOS"],["AEROGRAFO","AERÓGRAFO"],["FERRO DE SOLDA","SOLDADOR"],
  // frases
  ["DEMARCACAO TATIL","SEÑALIZACIÓN TÁCTIL"],["CLUBE DO CHURRASCO","CLUB DEL ASADO"],["OLHO GREGO","OLHO GRIEGO"],["ARCO IRIS","ARCOÍRIS"],
  ["MORA AQUI","VIVE AQUÍ"],["DOCE LAR","DULCE HOGAR"],["MELHORES AVOS","MEJORES ABUELOS"],["NAS NUVENS","EN LAS NUBES"],["PALMA DA MAO","PALMA DE LA MANO"],
  ["NOVA IORQUE","NUEVA YORK"],["SAO PAULO","SÃO PAULO"],["PIC NIC","PICNIC"],["MEIO FIO","BORDILLO"],
  // palavras
  ["TOALHAS","MANTELES"],["TOALHA","MANTEL"],["BORDA","BORDE"],["CARINHO","CARIÑO"],["BANDEIRA","BANDERA"],["ANTIDERRAPANTE","ANTIDESLIZANTE"],["ANTIDER","ANTIDESL."],
  ["TATIL","TÁCTIL"],["DIRECIONAL","DIRECCIONAL"],["AGULHADO","PUNZONADO"],["EXPOSITOR","EXHIBIDOR"],["XADREZ","CUADROS"],["LAR","HOGAR"],["MODULO","MÓDULO"],
  ["ROXO","MORADO"],["GALINHAS","GALLINAS"],["GALINHA","GALLINA"],["LIMOES","LIMONES"],["LIMAO","LIMÓN"],["BRONZE","BRONCE"],["MARITIMO","MARÍTIMO"],["MOEDA","MONEDA"],
  ["CRU","CRUDO"],["FITA","CINTA"],["DOCE","DULCE"],["BAMBU","BAMBÚ"],["CAIPIRA","CAMPESTRE"],["PAREDE","PARED"],["MEIO","MEDIO"],["LOJA","TIENDA"],["FOLHAS","HOJAS"],
  ["CAO","PERRO"],["DEGRADE","DEGRADÉ"],["ALCA","ASA"],["AMARELINHA","RAYUELA"],["MINERACAO","MINERÍA"],["REGUA","REGLA"],["ALUMINIO","ALUMINIO"],["PEROLIZADA","PERLADA"],
  ["CORUJAS","BÚHOS"],["TALHERES","CUBIERTOS"],["CROCHE","CROCHET"],["ROSTO","ROSTRO"],["SILHUETA","SILUETA"],["BLOCOS","BLOQUES"],["VOGAIS","VOCALES"],["CASINHA","CASITA"],
  ["PEQUENO","PEQUEÑO"],["ARARA","GUACAMAYO"],["LINHAS","LÍNEAS"],["LINHA","LÍNEA"],["ROLOS","ROLLOS"],["ROLO","ROLLO"],["PECAS","PIEZAS"],["PCS","PZS"],["TAPETES","ALFOMBRAS"],
  ["VINILICOS","VINÍLICOS"],["VINILICA","VINÍLICA"],["VINILICO","VINÍLICO"],["CHURRASQUEIRA","PARRILLA"],["CHURRASCO","ASADO"],["METALICA","METÁLICA"],["METALICO","METÁLICO"],
  ["COLMEIA","COLMENA"],["NUMEROS","NÚMEROS"],["LABIRINTO","LABERINTO"],["MAGICO","MÁGICO"],["BANCADA","MESA DE TRABAJO"],["PIA","LAVABO"],["ACABAMENTO","ACABADO"],
  ["AGUA","AGUA"],["BEBE","BEBÉ"],["CARVAO","CARBÓN"],["PALHA","PAJA"],["CORACOES","CORAZONES"],["BORBOLETA","MARIPOSA"],["QUADRADOS","CUADRADOS"],["QUADRADA","CUADRADA"],
  ["ORNAMENTAIS","ORNAMENTALES"],["ZEBRADA","CEBRA"],["CIDADE","CIUDAD"],["CARVALHO","ROBLE"],["NOGUEIRA","NOGAL"],["PIMENTAS","PIMIENTAS"],["GRAO","GRANO"],["MANHA","MAÑANA"],
  ["GAIOLAS","JAULAS"],["ORQUIDEAS","ORQUÍDEAS"],["AZUIS","AZULES"],["RENDADAS","DE ENCAJE"],["CLASSICO","CLÁSICO"],["CLASSICAS","CLÁSICAS"],["CLASSICA","CLÁSICA"],
  ["NATUREZA","NATURALEZA"],["LAPIS","LÁPIZ"],["COR","COLOR"],["PEGADAS","HUELLAS"],["SELOS","SELLOS"],["CERVEJA","CERVEZA"],["ABSTRATOS","ABSTRACTOS"],["VINHO","VINO"],
  ["CARIMBOS","SELLOS"],["CARIMBO","SELLO"],["PASSAPORTE","PASAPORTE"],["BONECA","MUÑECA"],["FUTEBOL","FÚTBOL"],["FAZENDINHA","GRANJITA"],["SUPORTE","SOPORTE"],["EIXO","EJE"],
  ["MISTURADOR","MEZCLADOR"],["PENEUMATICA","NEUMÁTICA"],["ESQUADRO","ESCUADRA"],["CIRCULOS","CÍRCULOS"],["ONDE","DONDE"],["PAI","PADRE"],["CERAMICA","CERÁMICA"],
  ["BORDO","BURDEOS"],["GRAMAS","CÉSPEDES"],["GRAMA","CÉSPED"],["FLORESTA","BOSQUE"],["BARRADO","CON BARRA"],["LOSANGOS","ROMBOS"],["TOQUIO","TOKIO"],["PEQUIM","PEKÍN"],
  ["CAFETERIA","CAFETERÍA"],["MARINHO","MARINO"],["CACHEPOS","MACETEROS"],["CACTOS","CACTUS"],["DIVERSOS","DIVERSOS"],["ALFABETO","ALFABETO"],["CITRICO","CÍTRICO"],
  ["SINTETICA","SINTÉTICA"],["SINTETICO","SINTÉTICO"],["ESTRELAS","ESTRELLAS"],["CORACAO","CORAZÓN"],["MAQ","MÁQ."],["MAQUINAS","MÁQUINAS"],
  ["OBRAS","OBRAS"],["EM","EN"],["COM","CON"],["SEM","SIN"],["E","Y"],["DO","DEL"],["DOS","DE LOS"],["DA","DE LA"],["DAS","DE LAS"],["NA","EN LA"],["NO","EN EL"]
];
const DIC_RE = DIC.map(([pt, es]) => [new RegExp("(?<=[\\s(/])" + pt.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + "(?=[\\s)/,.])","g"), es]);
function traduzir(s){
  let t = " " + (s||"") + " ";
  DIC_RE.forEach(([re, es]) => { t = t.replace(re, es); });
  t = t.trim();
  // como no modelo: produto vinílico vira "ALFOMBRA VINÍLICA …"; tropical em rolo é "CAMINO", em peça é "ALFOMBRA"
  if(/^VINÍLICA\b/.test(t)) t = "ALFOMBRA " + t;
  if(/^TROPICAL\b/.test(t)){ const {l} = medidas(s); t = (!l || l >= 5 ? "CAMINO " : "ALFOMBRA ") + t; }
  return t;
}

/* ---------- fator de conversão (M²/MT -> rolo) a partir da medida na descrição ---------- */
function medidas(desc){
  const d = norm(desc).replace(/,/g,".");
  const toM = (v,u) => u==="CM" ? v/100 : u==="MM" ? v/1000 : v;
  let m = d.match(/(\d+(?:\.\d+)?)\s*(CM|MM|M)?\s*X\s*(\d+(?:\.\d+)?)\s*(CM|MM|M)?(?![A-Z0-9])/);
  if(m){
    // sem unidade nenhuma: deduz pela grandeza (920X920 = mm, 60X180 = cm, 2X25 = m)
    const semU = Math.max(+m[1], +m[3]) >= 300 ? "MM" : Math.max(+m[1], +m[3]) >= 30 ? "CM" : "M";
    let u1 = m[2] || m[4] || semU, u2 = m[4] || m[2] || semU;
    let a = toM(+m[1],u1), b = toM(+m[3],u2);
    return {w:Math.min(a,b), l:Math.max(a,b)};
  }
  const w = d.match(/(\d+(?:\.\d+)?)\s*CM(?![A-Z])/), l = d.match(/(\d+(?:\.\d+)?)\s*M(?![A-Z])/);
  return {w: w ? +w[1]/100 : null, l: l ? +l[1] : null};
}
const nf = n => String(r2(n)).replace(".",",");
function sugerirUnidade(p){
  const base = {unidade: UM_ES[p.um] || p.um || "PIEZA", fator: 1, baseFator: ""};
  if(p.um !== "M2" && p.um !== "MT") return base;
  const {w,l} = medidas(p.desc);
  if(!l || l < 5 || l > 100) return base;
  if(p.um === "MT") return {unidade:"ROLLO", fator:l, baseFator:`${nf(l)} m lineales por rollo`};
  if(w) return {unidade:"ROLLO", fator:r2(w*l), baseFator:`${nf(w*l)} m² por rollo (${nf(w)} x ${nf(l)} m)`};
  return base;
}


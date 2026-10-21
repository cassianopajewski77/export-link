// Monta web/gerador.html (versão online) a partir de original/Gerador de Proforma.html (versão do PC).
// Uso: node ferramentas/montar_gerador.js   (rode de novo sempre que o HTML do PC mudar)
const fs = require("fs"), path = require("path");
const raiz = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(raiz, "original", "Gerador de Proforma.html"), "utf8");
const trocar = (de, para, rotulo) => { if(de instanceof RegExp ? !de.test(html) : !html.includes(de)) throw new Error("não achei: " + rotulo); html = html.replace(de, para); };

// 1) os dados deixam de vir de arquivos .js da pasta: a ponte lê do Supabase
for(const js of ["dados.js", "produtos_cadastrados.js", "clientes_cadastrados.js", "embalagens.js"])
  trocar(`<script src="${js}"></script>\n`, "", js);
// 2) supabase-js + configuração + ponte, logo depois do ExcelJS
const exceljs = '<script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>\n';
trocar(exceljs, exceljs +
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js"></script>\n' +
  '<script src="config.js"></script>\n<script src="ponte.js"></script>\n<link rel="stylesheet" href="ponte.css">\n<link rel="icon" href="logo/exportdocspro.ico">\n', "exceljs");
// 3) os scripts do gerador só rodam depois que a ponte carregou os dados
const n = (html.match(/^<script>$/gm) || []).length;
if(n !== 3) throw new Error(`esperava 3 blocos <script>, achei ${n}`);
html = html.replace(/^<script>$/gm, '<script type="text/x-gerador">');
// 4) dados bancários não ficam no código publicado: vêm do banco (configuracoes.exportador)
trocar(/\n  banco:\[[\s\S]*?\]\.join\("\\n"\)\};/, '\n  banco:""};', "banco");

fs.writeFileSync(path.join(raiz, "web", "gerador.html"), html);
console.log("web/gerador.html montado (" + (html.length / 1024).toFixed(0) + " KB)");

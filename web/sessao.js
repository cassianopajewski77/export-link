/* =====================================================================
   SEGURANÇA DA SESSÃO (como site de banco)
   - Sai sozinho depois de MINUTOS_SEM_USO sem mexer no sistema (mouse, teclado, toque, rolagem).
   - 2 minutos antes aparece um aviso com contagem e o botão "Continuar conectado".
   - Vale para todas as abas abertas: usar o sistema em uma aba mantém as outras conectadas.
   - Se o navegador ficar fechado (ou o computador dormir) por mais tempo que isso, ao voltar
     a pessoa precisa entrar de novo: a sessão não fica guardada para sempre.
   O rascunho da proforma fica salvo no navegador, então sair por inatividade não perde o que
   estava sendo digitado.
   ===================================================================== */
(function(){
"use strict";
const MINUTOS_SEM_USO = 20, MINUTOS_AVISO = 2;
const CHAVE = "el_ultima_atividade", LIMITE = MINUTOS_SEM_USO * 60000, AVISO = MINUTOS_AVISO * 60000;
const ler = () => { try{ return +localStorage.getItem(CHAVE) || 0; }catch(e){ return 0; } };
const marcar = () => { try{ localStorage.setItem(CHAVE, String(Date.now())); }catch(e){} };
const limpar = () => { try{ localStorage.removeItem(CHAVE); }catch(e){} };
// sem registro de atividade conta como vencida (ex.: sessão antiga, de antes desta regra)
const vencida = () => Date.now() - ler() > LIMITE;

async function sair(sb, motivo){
  limpar();
  try{ await sb.auth.signOut(); }catch(e){}
  location.replace("index.html" + (motivo ? "?saiu=" + motivo : ""));
}

// usado no gerador: fica de olho na atividade e desconecta quando passa do tempo
function vigiar(sb){
  marcar();
  let ultimaGravacao = Date.now(), caixa = null, saindo = false;
  const atividade = () => {
    if(caixa || saindo) return;                     // com o aviso aberto, só o botão renova
    if(Date.now() - ultimaGravacao > 10000){ marcar(); ultimaGravacao = Date.now(); }
  };
  ["mousemove","mousedown","keydown","wheel","touchstart","scroll"].forEach(ev => addEventListener(ev, atividade, {passive:true, capture:true}));

  function mostrarAviso(){
    if(caixa) return;
    caixa = document.createElement("div");
    caixa.id = "sessaoAviso";
    caixa.innerHTML = `<div class="sa-box" role="alertdialog" aria-modal="true" aria-labelledby="saTit">
      <h2 id="saTit">Você ainda está aí?</h2>
      <p>Por segurança, o sistema vai sair sozinho em <b id="saConta"></b> por falta de uso.</p>
      <div class="sa-bot"><button type="button" class="sa-sair">Sair agora</button><button type="button" class="sa-ok">Continuar conectado</button></div></div>`;
    document.body.appendChild(caixa);
    caixa.querySelector(".sa-ok").onclick = () => { marcar(); ultimaGravacao = Date.now(); fecharAviso(); };
    caixa.querySelector(".sa-sair").onclick = () => { saindo = true; sair(sb, ""); };
    caixa.querySelector(".sa-ok").focus();
  }
  function fecharAviso(){ if(caixa){ caixa.remove(); caixa = null; } }
  function conferir(){
    if(saindo) return;
    const resta = LIMITE - (Date.now() - ler());
    if(resta <= 0){ saindo = true; return sair(sb, "inatividade"); }
    if(resta <= AVISO){
      mostrarAviso();
      const s = Math.ceil(resta / 1000), el = caixa && caixa.querySelector("#saConta");
      if(el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    } else fecharAviso();                            // outra aba renovou
  }
  setInterval(conferir, 1000);
  document.addEventListener("visibilitychange", () => { if(!document.hidden) conferir(); });
  addEventListener("storage", e => { if(e.key === CHAVE && !e.newValue && !saindo){ saindo = true; location.replace("index.html"); } });
}

window.SESSAO_SEG = {marcar, limpar, vencida, sair, vigiar, MINUTOS_SEM_USO};
})();

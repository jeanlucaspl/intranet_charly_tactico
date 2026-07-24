// ── ARMAR PRÁCTICA ────────────────────────────────────────────────────────────
const GP={
  cfg:{titulo:'',fecha:'',tiempo:'',instrucciones:'',mostrarPts:false,caratula:false,colsForzar:0,escalaFuente:1.2,separadorCols:true,watermark:true,wmOpacity:0.13,wmSize:70},
  targetPages:1,
  secciones:[],
  layout:{cols:1,pages:1},
  init:false
};

/* Constantes PDF del generador */
const gpPW=210,gpML=9,gpMR=9,gpGAP=5,gpFOOT=283;
const gpNAVY=[13,27,46],gpGOLD=[201,168,76],gpWHITE=[255,255,255],gpMUTED=[160,180,200],gpLIGHT=[248,250,252],gpBORDER=[220,227,234];
const gpFS={1:9,2:8,3:7.5},gpLH={1:4.5,2:4,3:3.8},gpIND={1:8,2:7,3:6};
function gpCW(n){return(gpPW-gpML-gpMR-(n-1)*gpGAP)/n;}
function gpCX(n,i){return gpML+i*(gpCW(n)+gpGAP);}
function gpTW(n){return gpCW(n)-gpIND[n]-2;}
const gpEsc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function gpFSn(nc){return Math.round(gpFS[nc]*(GP.cfg.escalaFuente||1)*10)/10;}
function gpLHn(nc){return Math.round(gpLH[nc]*(GP.cfg.escalaFuente||1)*10)/10;}
// Detecta expresiones LaTeX complejas para inyectar \displaystyle
const GP_COMPLEX_RE = /\\frac|\\sqrt|\\sum|\\int|\\prod|\\lim|\\binom|\\over\b|\\begin/;
function gpEffectiveFsPt(texts, fsPt){ return fsPt; }
// Inyecta \displaystyle dentro de cada bloque $...$ cuando hay fracciones/raíces
function gpAddDisplayStyle(text){
  if(!text||!GP_COMPLEX_RE.test(text)) return text;
  return text.replace(/\$\$[\s\S]+?\$\$|\$([^$]+)\$/g,(m,inner)=>{
    if(!inner) return m; // bloque $$...$$ → no tocar
    return GP_COMPLEX_RE.test(inner)?`$\\displaystyle ${inner}$`:m;
  });
}
// Convierte LaTeX con \text{} al formato mixto HTML+$math$:
// - Si ya tiene $ → devuelve tal cual
// - Si tiene \text{} → extrae texto plano + envuelve el LaTeX en $...$
// - Si tiene LaTeX sin $ → envuelve en $...$
// - Texto plano → devuelve tal cual
const _gpHasLatex=s=>s.includes('\\')||s.includes('^{')||s.includes('_{');
function gpMbWrap(s){
  if(!s) return '';
  if(s.includes('$')) return s;
  if(!_gpHasLatex(s)) return s;
  if(!s.includes('\\text{')) return `$${s}$`;
  const parts=[];
  const re=/\\text\{([^}]*)\}/g;
  let last=0,m;
  while((m=re.exec(s))!==null){
    const before=s.slice(last,m.index).trim();
    if(before) parts.push(`$${before}$`);
    parts.push(m[1]);
    last=m.index+m[0].length;
  }
  const after=s.slice(last).trim();
  if(after) parts.push(`$${after}$`);
  return parts.join('');
}

/* ── Draft (localStorage) ── */
function gpSaveDraft(){try{localStorage.setItem('gp_draft',JSON.stringify({cfg:GP.cfg,targetPages:GP.targetPages,secciones:GP.secciones}));}catch(e){}}
function gpClearDraft(){localStorage.removeItem('gp_draft');}
async function gpNuevo(){
  if(!await myConfirm('¿Comenzar práctica nueva? Se borrará el borrador actual.'))return;
  Object.assign(GP.cfg,{titulo:'',fecha:new Date().toISOString().slice(0,10),tiempo:'',instrucciones:'',mostrarPts:false,caratula:false,colsForzar:0,escalaFuente:1.2,separadorCols:true,watermark:true,wmOpacity:0.13,wmSize:70});
  GP.targetPages=1;
  GP.secciones=[{nombre:allMaterias[0]?.nombre||'Sección',materia_id:allMaterias[0]?.id||null,
    items:[{tipo:'pregunta',e:'',ePost:'',imgData:null,imgW:0,imgH:0,p:1,si:[],alts:['','','','',''],altCorrecta:-1,numAlts:5,align:'left'}]}];
  gpClearDraft();gpRenderUI();
}

async function gpIniciar(){
  if(!allMaterias.length) await loadMaterias();
  if(!GP.init){
    const raw=localStorage.getItem('gp_draft');
    if(raw){
      try{
        const d=JSON.parse(raw);
        const restore=await myConfirm('Hay un borrador guardado. ¿Recuperarlo?');
        if(restore){
          Object.assign(GP.cfg,d.cfg);GP.targetPages=d.targetPages;GP.secciones=d.secciones;
        } else {
          gpClearDraft();
          GP.cfg.fecha=new Date().toISOString().slice(0,10);
          GP.secciones=[{nombre:allMaterias[0]?.nombre||'Sección',materia_id:allMaterias[0]?.id||null,
            items:[{tipo:'pregunta',e:'',ePost:'',imgData:null,imgW:0,imgH:0,p:1,si:[],alts:['','','','',''],altCorrecta:-1,numAlts:5,align:'left'}]}];
        }
      }catch(e){
        GP.cfg.fecha=new Date().toISOString().slice(0,10);
        GP.secciones=[{nombre:allMaterias[0]?.nombre||'Sección',materia_id:allMaterias[0]?.id||null,
          items:[{tipo:'pregunta',e:'',ePost:'',imgData:null,imgW:0,imgH:0,p:1,si:[],alts:['','','','',''],altCorrecta:-1,numAlts:5,align:'left'}]}];
      }
    } else {
      GP.cfg.fecha=new Date().toISOString().slice(0,10);
      GP.secciones=[{nombre:allMaterias[0]?.nombre||'Sección',materia_id:allMaterias[0]?.id||null,
        items:[{tipo:'pregunta',e:'',ePost:'',imgData:null,imgW:0,imgH:0,p:1,si:[],alts:['','','','',''],altCorrecta:-1,numAlts:5,align:'left'}]}];
    }
    GP.init=true;
  }
  gpRenderUI();
}

/* ── Layout engine ── */
function gpEstimarHEnunciado(doc,item,nc){
  const lh=gpLHn(nc),tw=gpTW(nc);
  let h=0;
  gpNormParas(item.e).forEach(p=>{if(!p.trim()){h+=lh*.4;return;}h+=doc.splitTextToSize(p,tw).length*lh;});
  if((item.imgData&&item.imgW&&item.imgH)||item.bpImgUrl){
    const _ratio=(item.imgW&&item.imgH)?item.imgH/item.imgW:0.5;
    h+=_ratio*gpTW(nc)+3;
    gpNormParas(item.ePost).forEach(p=>{if(!p.trim()){h+=lh*.4;return;}h+=doc.splitTextToSize(p,tw).length*lh;});
  }
  return h;
}
function gpEstimarHAlts(doc,item,nc){
  const lh=gpLHn(nc),tw=gpTW(nc);
  let h=0;
  if(item.tipo==='alternativas'){
    const n=item.numAlts||5;
    (item.alts||[]).slice(0,n).forEach(a=>{h+=doc.splitTextToSize(a||' ',tw-8).length*lh+1;});
  } else {
    (item.si||[]).forEach(s=>{h+=doc.splitTextToSize(s||' ',tw-8).length*lh+2;});
  }
  return h;
}
function gpEstimarH(doc,item,nc){
  doc.setFont('helvetica','normal');doc.setFontSize(gpFSn(nc));
  if(item.tipo==='texto'){
    const lh=gpLHn(nc);
    const tw=gpCW(nc)-4;
    const lines=item.texto?.trim()?doc.splitTextToSize(item.texto.trim(),tw):[];
    const imgH=item._textoImg?Math.round((tw/item._textoImg.w)*item._textoImg.h):(item.bpImgUrl?tw*0.5:0);
    return lines.length*lh+(lines.length?3:0)+(imgH?imgH+4:0)+4;
  }
  const hE=gpEstimarHEnunciado(doc,item,nc);
  const hA=gpEstimarHAlts(doc,item,nc);
  return 2+hE+hA+1;
}
function gpFirstY(doc){
  doc.setFont('helvetica','normal');doc.setFontSize(8);
  const istr=GP.cfg.instrucciones||'';
  const ih=istr?doc.splitTextToSize(istr,gpPW-gpML-gpMR).length*4.5+14:0;
  return 22+5+ih;
}
function gpSimular(nc){
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const topF=gpFirstY(doc),topO=14;
  const multi=GP.secciones.length>1;
  let col=0,pages=1,curY=topF,colTop=topF;
  const next=()=>{col++;if(col>=nc){col=0;pages++;colTop=topO;}curY=colTop;};
  GP.secciones.forEach(sec=>{
    if(multi){if(curY+9>gpFOOT)next();curY+=9;}
    sec.items.forEach(item=>{
      const h=gpEstimarH(doc,item,nc);
      if(curY+h<=gpFOOT){curY+=h;return;}
      // No cabe entero — intentar corte si es alternativas
      if(item.tipo==='alternativas'){
        const hEnc=2+gpEstimarHEnunciado(doc,item,nc);
        if(curY+hEnc<=gpFOOT){
          // Corte: enunciado aquí, alternativas en siguiente columna
          curY+=hEnc;next();
          curY+=gpEstimarHAlts(doc,item,nc)+1;
          return;
        }
      }
      next();curY+=h;
    });
  });
  return pages;
}
function gpCalcLayout(){
  if(GP.cfg.colsForzar>0){GP.layout={cols:GP.cfg.colsForzar,pages:gpSimular(GP.cfg.colsForzar)};return;}
  for(let c=1;c<=3;c++){const p=gpSimular(c);if(p<=GP.targetPages){GP.layout={cols:c,pages:p};return;}}
  GP.layout={cols:3,pages:gpSimular(3)};
}
function gpBadgeHTML(){
  gpCalcLayout();
  const{cols,pages}=GP.layout,over=pages>GP.targetPages&&!GP.cfg.colsForzar,forced=GP.cfg.colsForzar>0;
  const icons=Array.from({length:3},(_,i)=>`<div style="width:7px;background:${i<cols?'var(--gold)':'var(--border)'};height:24px"></div>`).join('');
  const totalPts=GP.secciones.reduce((s,sec)=>s+sec.items.reduce((ss,it)=>ss+(it.tipo!=='texto'?(+it.p||0):0),0),0);
  return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--navy3);border:1px solid var(--border)">
    <div style="display:flex;gap:3px">${icons}</div>
    <div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;color:var(--white);text-transform:uppercase">
        ${cols} col${cols>1?'umnas':'umna'} · ${pages} pág${pages>1?'s':''}${forced?` <span style="color:var(--gold);font-size:9px">■ forzado</span>`:''}
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:10px;color:var(--muted)">Total: ${totalPts} pts</div>
      ${over?`<div style="color:#e8a84c;font-size:10px">⚠ +${pages-GP.targetPages} pág. extra</div>`:''}
    </div>
  </div>`;
}

/* ── Modal edición expandida ── */
function gpEnsureModal(){
  if(document.getElementById('gp-edit-modal'))return;
  const m=document.createElement('div');
  m.id='gp-edit-modal';
  m.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:9997;align-items:center;justify-content:center';
  m.innerHTML=`
    <div style="background:var(--navy2);border:1px solid var(--gold);width:92%;max-width:820px;max-height:88vh;display:flex;flex-direction:column;border-radius:4px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.7)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 16px;border-bottom:1px solid var(--border);background:var(--navy3)">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:.2em;color:var(--gold);text-transform:uppercase">Editar Enunciado</div>
        <button onclick="gpCloseModal(false)" style="background:transparent;border:1px solid var(--border);color:var(--muted);font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;padding:3px 10px;cursor:pointer;text-transform:uppercase">✕ Cancelar</button>
      </div>
      <textarea id="gp-edit-ta" style="flex:1;min-height:340px;background:var(--navy);color:var(--white);font-family:'Barlow',sans-serif;font-size:14px;line-height:1.75;padding:18px;border:none;outline:none;resize:none" placeholder="Pega o escribe el enunciado completo aquí..."></textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 16px;border-top:1px solid var(--border);background:var(--navy3)">
        <button onclick="gpCloseModal(false)" style="padding:8px 20px;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:.15em;border:1px solid var(--border);background:transparent;color:var(--white);cursor:pointer;text-transform:uppercase">Cancelar</button>
        <button onclick="gpCloseModal(true)" style="padding:8px 22px;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:.15em;border:none;background:var(--gold);color:var(--navy);cursor:pointer;text-transform:uppercase">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function gpOpenModal(si,ii){
  gpEnsureModal();
  const m=document.getElementById('gp-edit-modal');
  document.getElementById('gp-edit-ta').value=GP.secciones[si].items[ii].e||'';
  m._si=si;m._ii=ii;
  m.style.display='flex';
  document.getElementById('gp-edit-ta').focus();
}
function gpCloseModal(save){
  const m=document.getElementById('gp-edit-modal');
  if(!m)return;
  if(save){
    GP.secciones[m._si].items[m._ii].e=document.getElementById('gp-edit-ta').value;
  }
  m.style.display='none';
  if(save)gpRenderUI();
}

/* ── UI ── */
function gpRenderUI(){
  gpEnsureModal();
  gpCalcLayout();
  let gnum=0;
  const multi=GP.secciones.length>1;
  const secsHTML=GP.secciones.map((sec,si)=>`
    <div style="background:var(--navy2);border:1px solid var(--border);margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;padding:9px 13px;border-bottom:1px solid var(--border);background:var(--navy3)">
        <span style="color:var(--gold);font-family:'Bebas Neue',sans-serif;font-size:15px">■</span>
        <select style="flex:1;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;letter-spacing:.1em;color:var(--gold);text-transform:uppercase;background:var(--navy3);border:none;border-bottom:1px solid var(--gold);outline:none;padding:2px 4px"
          onchange="GP.secciones[${si}].materia_id=this.value;GP.secciones[${si}].nombre=this.options[this.selectedIndex].text;gpRefreshBadge()">
          ${allMaterias.map(m=>`<option value="${m.id}" style="background:var(--navy2)" ${m.id==sec.materia_id?'selected':''}>${m.nombre}</option>`).join('')}
        </select>
        <button class="btn btn-red" style="padding:4px 8px;font-size:10px" onclick="gpDelSec(${si})">✕ Sección</button>
      </div>
      <div style="padding:11px 13px;display:flex;flex-direction:column;gap:9px">
        ${sec.items.map((item,ii)=>{
          /* ── BLOQUE TEXTO BASE ── */
          if(item.tipo==='texto') return `
            <div style="background:var(--navy3);border:1px solid var(--gold);border-left:3px solid var(--gold);padding:10px 12px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;color:var(--gold)">TEXTO BASE</span>
                  <input value="${gpEsc(item.etiqueta||'Texto')}"
                    style="background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--muted);font-family:'Barlow',sans-serif;font-size:11px;padding:2px 4px;outline:none;width:120px"
                    oninput="GP.secciones[${si}].items[${ii}].etiqueta=this.value">
                </div>
                <button class="btn btn-red" style="padding:3px 8px;font-size:10px" onclick="gpDelItem(${si},${ii})">✕</button>
              </div>
              ${item.bpImgUrl?`<img src="${item.bpImgUrl}" style="max-width:100%;max-height:220px;object-fit:contain;display:block;margin-bottom:8px;border:1px solid var(--border)">`:''}
              ${!item.texto?.trim()&&!item.bpImgUrl?`<div style="background:rgba(229,85,85,.1);border:1px solid #e55;padding:8px 10px;margin-bottom:8px;font-family:'Barlow Condensed',sans-serif;font-size:11px;color:#e55;letter-spacing:.05em">⚠ Texto de lectura vacío — pega la lectura completa en el campo de abajo para que aparezca en el PDF</div>`:''}
              <textarea style="width:100%;background:var(--navy);border:1px solid ${!item.texto?.trim()&&!item.bpImgUrl?'#e55':'var(--border)'};color:var(--white);font-family:'Barlow',sans-serif;font-size:12px;padding:8px;outline:none;resize:vertical;line-height:1.6" rows="5"
                oninput="GP.secciones[${si}].items[${ii}].texto=this.value;gpRefreshBadge()"
                placeholder="Pega aquí el texto de lectura...">${gpEsc(item.texto||'')}</textarea>
            </div>`;
          /* ── PREGUNTA / ALTERNATIVAS ── */
          gnum++;
          const isAlt=item.tipo==='alternativas';
          return `
          <div style="display:flex;gap:9px;align-items:flex-start;background:var(--navy);border:1px solid var(--border);padding:9px 11px">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--gold);line-height:1;min-width:22px;text-align:center;padding-top:4px">${gnum}</div>
            <div style="flex:1;display:flex;flex-direction:column;gap:7px">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;gap:3px;align-items:center">
                  <span style="font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:600;letter-spacing:.15em;color:var(--muted);text-transform:uppercase;margin-right:3px">Alinear</span>
                  ${[['left','L'],['center','C'],['right','R'],['justify','J']].map(([a,lab])=>`<button onclick="GP.secciones[${si}].items[${ii}].align='${a}';gpRenderUI()" style="width:22px;height:20px;font-size:10px;font-weight:700;font-family:'Barlow Condensed',sans-serif;border:1px solid ${(item.align||'left')===a?'var(--gold)':'var(--border)'};background:${(item.align||'left')===a?'rgba(201,168,76,.2)':'transparent'};color:${(item.align||'left')===a?'var(--gold)':'var(--muted)'};cursor:pointer">${lab}</button>`).join('')}
                </div>
                <button onclick="gpOpenModal(${si},${ii})" style="padding:2px 9px;font-size:9px;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.1em;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;text-transform:uppercase">⤢ Expandir</button>
              </div>
              <textarea style="width:100%;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--white);font-family:'Barlow',sans-serif;font-size:12px;padding:3px 0;outline:none;resize:vertical;line-height:1.5"
                rows="3" oninput="GP.secciones[${si}].items[${ii}].e=this.value;gpRefreshBadge()"
                placeholder="Enunciado — acepta LaTeX: $\\frac{3}{5}$">${gpEsc(item.e||'')}</textarea>
              ${item.imgData?`
              <div style="background:var(--navy3);border:1px solid var(--border);padding:8px">
                <img src="${item.imgData}" style="max-width:100%;max-height:130px;object-fit:contain;display:block;margin:0 auto">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
                  <span style="font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:600;letter-spacing:.15em;color:var(--muted);text-transform:uppercase">Imagen adjunta</span>
                  <button class="btn btn-red" style="padding:2px 8px;font-size:9px" onclick="gpRemoveImg(${si},${ii})">✕ Quitar</button>
                </div>
                <textarea style="width:100%;background:transparent;border:none;border-top:1px solid var(--border);color:var(--white);font-family:'Barlow',sans-serif;font-size:12px;padding:5px 0;outline:none;resize:vertical;line-height:1.5;margin-top:6px"
                  rows="2" oninput="GP.secciones[${si}].items[${ii}].ePost=this.value;gpRefreshBadge()"
                  placeholder="Texto después de la imagen (opcional)">${gpEsc(item.ePost||'')}</textarea>
              </div>`:`
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;padding:4px 10px;border:1px dashed var(--border);color:var(--muted);font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;align-self:flex-start">
                <input type="file" accept="image/*" style="display:none" onchange="gpSetImg(${si},${ii},this)">
                + Imagen
              </label>`}
              ${isAlt?`
              <div style="display:flex;flex-direction:column;gap:5px;margin-top:2px">
                ${['A','B','C','D','E'].slice(0,item.numAlts||5).map((L,ai)=>`
                <div style="display:flex;gap:7px;align-items:center">
                  <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                    <input type="radio" name="alt-${si}-${ii}" ${item.altCorrecta===ai?'checked':''}
                      onchange="GP.secciones[${si}].items[${ii}].altCorrecta=${ai}" style="accent-color:var(--gold)">
                    <span style="font-family:'Barlow Condensed',sans-serif;color:${item.altCorrecta===ai?'var(--gold)':'var(--muted)'};font-size:12px;font-weight:700">${L}</span>
                  </label>
                  <input style="flex:1;background:var(--navy3);border:1px solid var(--border);color:var(--white);font-family:'Barlow',sans-serif;font-size:11px;padding:5px 8px;outline:none"
                    value="${gpEsc((item.alts||[])[ai]||'')}"
                    oninput="GP.secciones[${si}].items[${ii}].alts[${ai}]=this.value;gpRefreshBadge()"
                    placeholder="Alternativa ${L}...">
                </div>`).join('')}
              </div>`:`
              ${(item.si||[]).map((s,sii)=>`
              <div style="display:flex;gap:6px;align-items:center">
                <span style="font-family:'Barlow Condensed',sans-serif;color:var(--gold);font-size:12px;font-weight:600;min-width:16px">${String.fromCharCode(97+sii)})</span>
                <input style="flex:1;background:var(--navy3);border:1px solid var(--border);color:var(--white);font-family:'Barlow',sans-serif;font-size:11px;padding:5px 8px;outline:none"
                  value="${gpEsc(s)}" oninput="GP.secciones[${si}].items[${ii}].si[${sii}]=this.value" placeholder="sub-ítem ${String.fromCharCode(97+sii)}...">
                <button class="btn btn-red" onclick="gpDelSI(${si},${ii},${sii})">✕</button>
              </div>`).join('')}`}
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px">
                ${!isAlt?`<button class="btn btn-outline" style="padding:4px 9px;font-size:10px" onclick="gpAddSI(${si},${ii})">+ Sub-ítem</button>`:''}
                <button onclick="gpToggleTipo(${si},${ii})"
                  style="padding:4px 10px;font-size:10px;border:1px solid ${isAlt?'var(--gold)':'var(--border)'};background:${isAlt?'rgba(201,168,76,.15)':'transparent'};color:${isAlt?'var(--gold)':'var(--muted)'};font-family:'Barlow Condensed',sans-serif;font-weight:600;letter-spacing:.1em;cursor:pointer;text-transform:uppercase"
                >${isAlt?'✓ Alternativas':'A–E Alternativas'}</button>
                ${isAlt?`<div style="display:flex;align-items:center;gap:4px">
                  <span style="font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:600;letter-spacing:.15em;color:var(--muted);text-transform:uppercase">Opciones</span>
                  ${[2,3,4,5].map(n=>`<button onclick="GP.secciones[${si}].items[${ii}].numAlts=${n};gpRenderUI()" style="width:22px;height:22px;font-family:'Bebas Neue',sans-serif;font-size:13px;border:1px solid ${(item.numAlts||5)===n?'var(--gold)':'var(--border)'};background:${(item.numAlts||5)===n?'var(--gold)':'transparent'};color:${(item.numAlts||5)===n?'var(--navy)':'var(--muted)'};cursor:pointer">${n}</button>`).join('')}
                </div>`:''}
                <span style="font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:600;letter-spacing:.18em;color:var(--muted);text-transform:uppercase">Pts</span>
                <input type="number" min="0" max="20" value="${item.p||''}"
                  style="width:50px;background:var(--navy);border:1px solid var(--border);color:var(--white);font-family:'Barlow',sans-serif;font-size:12px;padding:5px 7px;outline:none;text-align:center"
                  oninput="GP.secciones[${si}].items[${ii}].p=+this.value;gpRefreshBadge()">
              </div>
            </div>
            <button class="btn btn-red" style="margin-top:4px;padding:4px 8px;font-size:10px" onclick="gpDelItem(${si},${ii})">✕</button>
          </div>`;
        }).join('')}
        <div style="display:flex;gap:8px;margin-top:2px">
          <button class="btn btn-outline" style="padding:6px 12px;font-size:10px" onclick="gpAddQ(${si})">+ Pregunta</button>
          <button class="btn btn-outline" style="padding:6px 12px;font-size:10px;border-color:var(--gold);color:var(--gold)" onclick="gpAddTexto(${si})">+ Texto base</button>
        </div>
      </div>
    </div>`).join('');

  document.getElementById('gp-root').innerHTML=`
    <div class="ph"><div class="ph-left"><div class="eye">Generador inteligente</div><div class="ttl">ARMAR PRÁCTICA</div></div><button class="btn btn-outline" style="font-size:10px;padding:5px 11px;border-color:var(--red);color:var(--red)" onclick="gpNuevo()">Nueva práctica</button></div>
    <div class="sc" style="margin-bottom:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px;margin-bottom:11px">
        <div class="fg" style="margin-bottom:0"><label>Título</label>
          <input value="${gpEsc(GP.cfg.titulo)}" oninput="GP.cfg.titulo=this.value;gpRefreshBadge()" placeholder="Práctica N°1"></div>
        <div class="fg" style="margin-bottom:0"><label>Fecha</label>
          <input type="date" value="${GP.cfg.fecha}" oninput="GP.cfg.fecha=this.value"></div>
        <div class="fg" style="margin-bottom:0"><label>Tiempo (min)</label>
          <input type="number" value="${GP.cfg.tiempo}" min="1" oninput="GP.cfg.tiempo=this.value" placeholder="45"></div>
      </div>
      <div class="fg" style="margin-bottom:11px"><label>Instrucciones</label>
        <textarea rows="2" oninput="GP.cfg.instrucciones=this.value;gpRefreshBadge()" placeholder="Instrucciones generales...">${gpEsc(GP.cfg.instrucciones||'')}</textarea>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--border)">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" ${GP.cfg.mostrarPts?'checked':''} onchange="GP.cfg.mostrarPts=this.checked;gpRefreshBadge()" style="accent-color:var(--gold);width:15px;height:15px">
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--white)">Mostrar puntaje por pregunta</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" ${GP.cfg.caratula?'checked':''} onchange="GP.cfg.caratula=this.checked" style="accent-color:var(--gold);width:15px;height:15px">
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--white)">Incluir carátula</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" ${GP.cfg.watermark?'checked':''} onchange="GP.cfg.watermark=this.checked;gpRefreshWM()" style="accent-color:var(--gold);width:15px;height:15px">
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--white)">Marca de agua</span>
        </label>
        <div id="gp-wm-ctrl" style="display:${GP.cfg.watermark?'flex':'none'};align-items:center;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:600;letter-spacing:.1em;color:var(--muted);text-transform:uppercase">Opacidad</span>
            <input type="range" min="3" max="30" step="1" value="${Math.round((GP.cfg.wmOpacity||0.10)*100)}"
              oninput="GP.cfg.wmOpacity=this.value/100;document.getElementById('gp-wm-val').textContent=this.value+'%'"
              style="width:80px;accent-color:var(--gold)">
            <span id="gp-wm-val" style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:600;color:var(--white);min-width:30px">${Math.round((GP.cfg.wmOpacity||0.10)*100)}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:600;letter-spacing:.1em;color:var(--muted);text-transform:uppercase">Tamaño</span>
            <input type="range" min="40" max="100" step="5" value="${GP.cfg.wmSize||70}"
              oninput="GP.cfg.wmSize=+this.value;document.getElementById('gp-wm-size-val').textContent=this.value+'%'"
              style="width:80px;accent-color:var(--gold)">
            <span id="gp-wm-size-val" style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:600;color:var(--white);min-width:36px">${GP.cfg.wmSize||70}%</span>
          </div>
        </div>
      </div>
    </div>
    ${secsHTML}
    <button class="btn btn-outline" style="margin-bottom:14px;padding:7px 14px;font-size:11px" onclick="gpAddSec()">+ Agregar sección</button>
    <div class="sc" style="margin-bottom:14px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:600;letter-spacing:.25em;color:var(--gold);text-transform:uppercase;margin-bottom:12px">Layout</div>
      <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:600;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Páginas objetivo</div>
          <div style="display:flex;gap:5px">
            ${[1,2,3,4].map(n=>`<button onclick="gpSetPages(${n})" style="width:34px;height:34px;font-family:'Bebas Neue',sans-serif;font-size:17px;border:1px solid ${GP.targetPages===n&&!GP.cfg.colsForzar?'var(--gold)':'var(--border)'};background:${GP.targetPages===n&&!GP.cfg.colsForzar?'var(--gold)':'transparent'};color:${GP.targetPages===n&&!GP.cfg.colsForzar?'var(--navy)':'var(--muted)'};cursor:pointer">${n}</button>`).join('')}
          </div>
        </div>
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:600;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Forzar columnas</div>
          <div style="display:flex;gap:5px">
            ${[1,2,3].map(n=>`<button onclick="gpSetColsForzar(${n})" style="width:34px;height:34px;font-family:'Bebas Neue',sans-serif;font-size:17px;border:1px solid ${GP.cfg.colsForzar===n?'var(--gold)':'var(--border)'};background:${GP.cfg.colsForzar===n?'var(--gold)':'transparent'};color:${GP.cfg.colsForzar===n?'var(--navy)':'var(--muted)'};cursor:pointer">${n}</button>`).join('')}
          </div>
          <div style="margin-top:5px;font-family:'Barlow Condensed',sans-serif;font-size:9px;color:var(--muted)">Click de nuevo para desactivar</div>
        </div>
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:600;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Tamaño de fuente</div>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="range" min="0.7" max="1.3" step="0.05" value="${GP.cfg.escalaFuente||1}"
              oninput="GP.cfg.escalaFuente=+this.value;document.getElementById('gp-fs-val').textContent=Math.round(this.value*100)+'%';gpRefreshBadge()"
              style="width:90px;accent-color:var(--gold)">
            <span id="gp-fs-val" style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:600;color:var(--white);min-width:34px">${Math.round((GP.cfg.escalaFuente||1)*100)}%</span>
          </div>
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-top:10px">
            <input type="checkbox" ${GP.cfg.separadorCols?'checked':''} onchange="GP.cfg.separadorCols=this.checked" style="accent-color:var(--gold);width:14px;height:14px">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Líneas divisorias</span>
          </label>
        </div>
        <div id="gp-badge">${gpBadgeHTML()}</div>
      </div>
    </div>
    <button class="btn btn-gold" style="width:100%;padding:14px;font-size:14px;letter-spacing:.2em" id="gp-btn-gen" onclick="generarPracticaPDF()"> Generar PDF</button>
    <div id="gp-status" style="text-align:center;font-size:12px;color:var(--muted);margin-top:8px;min-height:16px"></div>`;
  gpSaveDraft();
}

function gpRefreshBadge(){const el=document.getElementById('gp-badge');if(el)el.innerHTML=gpBadgeHTML();}
function gpRefreshWM(){const el=document.getElementById('gp-wm-ctrl');if(el)el.style.display=GP.cfg.watermark?'flex':'none';}
function gpAddQ(si){GP.secciones[si].items.push({tipo:'pregunta',e:'',ePost:'',imgData:null,imgW:0,imgH:0,p:1,si:[],alts:['','','','',''],altCorrecta:-1,numAlts:5,align:'left'});gpRenderUI();}
function gpAddTexto(si){GP.secciones[si].items.push({tipo:'texto',texto:'',etiqueta:'Texto'});gpRenderUI();}
function gpDelItem(si,ii){GP.secciones[si].items.splice(ii,1);gpRenderUI();}
function gpToggleTipo(si,ii){
  const it=GP.secciones[si].items[ii];
  if(it.tipo==='pregunta'){it.tipo='alternativas';if(!it.alts?.length)it.alts=['','','','',''];if(it.altCorrecta==null)it.altCorrecta=-1;}
  else if(it.tipo==='alternativas')it.tipo='pregunta';
  gpRenderUI();
}
function gpSetImg(si,ii,input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      GP.secciones[si].items[ii].imgData=e.target.result;
      GP.secciones[si].items[ii].imgW=img.width;
      GP.secciones[si].items[ii].imgH=img.height;
      gpRenderUI();
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
function gpRemoveImg(si,ii){GP.secciones[si].items[ii].imgData=null;GP.secciones[si].items[ii].imgW=0;GP.secciones[si].items[ii].imgH=0;gpRenderUI();}
function gpAddSI(si,ii){GP.secciones[si].items[ii].si.push('');gpRenderUI();}
function gpDelSI(si,ii,sii){GP.secciones[si].items[ii].si.splice(sii,1);gpRenderUI();}
function gpAddSec(){GP.secciones.push({nombre:allMaterias[0]?.nombre||'Nueva Sección',materia_id:allMaterias[0]?.id||null,
  items:[{tipo:'pregunta',e:'',ePost:'',imgData:null,imgW:0,imgH:0,p:1,si:[],alts:['','','','',''],altCorrecta:-1,numAlts:5,align:'left'}]});gpRenderUI();}
function gpDelSec(si){
  GP.secciones.splice(si,1);
  if(!GP.secciones.length)GP.secciones=[{nombre:allMaterias[0]?.nombre||'Sección',materia_id:allMaterias[0]?.id||null,items:[{tipo:'pregunta',e:'',ePost:'',imgData:null,imgW:0,imgH:0,p:1,si:[],alts:['','','','',''],altCorrecta:-1,numAlts:5,align:'left'}]}];
  gpRenderUI();
}
function gpSetPages(n){GP.targetPages=n;GP.cfg.colsForzar=0;gpRenderUI();}
function gpSetColsForzar(n){GP.cfg.colsForzar=(GP.cfg.colsForzar===n?0:n);gpRenderUI();}

/* ── MathJax pre-render ── */
// Normaliza texto con saltos de línea de PDF: une líneas simples con espacio,
// mantiene párrafos reales (\n\n) como separadores.
function gpNormParas(text){
  return (text||'')
    .replace(/\r\n/g,'\n')
    .replace(/[ \t]+/g,' ')
    .replace(/\n{2,}/g,'\x00')
    .replace(/\n/g,' ')
    .replace(/\x00/g,'\n')
    .split('\n');
}

function gpBuildQHTML(item,fsPt){
  const fsPx=(fsPt*(96/72)).toFixed(1),lhPx=(fsPt*(96/72)*1.55).toFixed(1);
  let h=`<div style="font-family:Helvetica,Arial,sans-serif;font-size:${fsPx}px;line-height:${lhPx}px;color:#141e32;padding:1px 0">`;
  gpNormParas(item.e).forEach(par=>{
    if(!par.trim()){h+=`<div style="height:${(fsPt*(96/72)*.4).toFixed(1)}px"></div>`;return;}
    h+=`<p style="margin:0 0 1px 0;text-align:justify">${gpAddDisplayStyle(par)}</p>`;
  });
  const _imgSrc=item.imgData||(item.bpImgUrl||null);
  if(_imgSrc){
    h+=`<img src="${_imgSrc}" crossorigin="anonymous" style="max-width:100%;height:auto;display:block;margin:3px 0">`;
    gpNormParas(item.ePost).forEach(par=>{
      if(!par.trim()){h+=`<div style="height:${(fsPt*(96/72)*.4).toFixed(1)}px"></div>`;return;}
      h+=`<p style="margin:0 0 1px 0;text-align:justify">${gpAddDisplayStyle(par)}</p>`;
    });
  }
  if(item.tipo==='alternativas'){
    const n=item.numAlts||5;
    const altsToShow=(item.alts||[]).slice(0,n);
    const maxAltLen=Math.max(...altsToShow.map(a=>(a||'').length));
    const cols=maxAltLen>42?1:2;
    h+=`<div style="display:grid;grid-template-columns:${cols===1?'1fr':'1fr 1fr'};gap:1px 8px;margin-top:2px">`;
    ['A','B','C','D','E'].slice(0,n).forEach((L,i)=>{
      const txt=gpAddDisplayStyle((item.alts||[])[i]||'');
      h+=`<div style="display:flex;gap:4px;align-items:flex-start;padding:0"><span style="font-weight:700;min-width:13px;flex-shrink:0">${L})</span><span>${txt}</span></div>`;
    });
    h+=`</div>`;
  } else {
    (item.si||[]).forEach((si,i)=>{
      h+=`<div style="display:flex;gap:6px;margin-top:2px"><span style="color:#333333;font-weight:700;min-width:18px;flex-shrink:0">${String.fromCharCode(97+i)})</span><span>${gpAddDisplayStyle(si)}</span></div>`;
    });
  }
  return h+'</div>';
}
function gpBuildEnunciadoHTML(item,fsPt){
  const fsPx=(fsPt*(96/72)).toFixed(1),lhPx=(fsPt*(96/72)*1.55).toFixed(1);
  let h=`<div style="font-family:Helvetica,Arial,sans-serif;font-size:${fsPx}px;line-height:${lhPx}px;color:#141e32;padding:1px 0">`;
  gpNormParas(item.e).forEach(par=>{
    if(!par.trim()){h+=`<div style="height:${(fsPt*(96/72)*.4).toFixed(1)}px"></div>`;return;}
    h+=`<p style="margin:0 0 1px 0;text-align:justify">${gpAddDisplayStyle(par)}</p>`;
  });
  const _imgSrc=item.imgData||(item.bpImgUrl||null);
  if(_imgSrc){
    h+=`<img src="${_imgSrc}" crossorigin="anonymous" style="max-width:100%;height:auto;display:block;margin:3px 0">`;
    gpNormParas(item.ePost).forEach(par=>{
      if(!par.trim()){h+=`<div style="height:${(fsPt*(96/72)*.4).toFixed(1)}px"></div>`;return;}
      h+=`<p style="margin:0 0 1px 0;text-align:justify">${gpAddDisplayStyle(par)}</p>`;
    });
  }
  return h+'</div>';
}
function gpBuildAltsHTML(item,fsPt){
  const fsPx=(fsPt*(96/72)).toFixed(1),lhPx=(fsPt*(96/72)*1.55).toFixed(1);
  const n=item.numAlts||5;
  const altsToShow=(item.alts||[]).slice(0,n);
  const maxAltLen=Math.max(...altsToShow.map(a=>(a||'').length));
  const cols=maxAltLen>42?1:2;
  let h=`<div style="font-family:Helvetica,Arial,sans-serif;font-size:${fsPx}px;line-height:${lhPx}px;color:#141e32;padding:1px 0">`;
  h+=`<div style="display:grid;grid-template-columns:${cols===1?'1fr':'1fr 1fr'};gap:1px 8px;margin-top:2px">`;
  ['A','B','C','D','E'].slice(0,n).forEach((L,i)=>{
    const txt=gpAddDisplayStyle((item.alts||[])[i]||'');
    h+=`<div style="display:flex;gap:4px;align-items:flex-start;padding:0"><span style="font-weight:700;min-width:13px;flex-shrink:0">${L})</span><span>${txt}</span></div>`;
  });
  h+=`</div></div>`;
  return h;
}
// Carga en base64 las imágenes de bloques TEXTO BASE (enunciado como imagen)
function _gpLoadImg(url){
  return new Promise((res,rej)=>{
    const img=new Image();img.crossOrigin='anonymous';
    img.onload=()=>{
      const c=document.createElement('canvas');
      c.width=img.naturalWidth;c.height=img.naturalHeight;
      c.getContext('2d').drawImage(img,0,0);
      res({b64:c.toDataURL('image/png'),w:img.naturalWidth,h:img.naturalHeight});
    };
    img.onerror=rej;img.src=url;
  });
}
async function gpPreloadTextoImgs(){
  for(const sec of GP.secciones){
    for(const it of sec.items){
      if(it.tipo==='texto'&&it.bpImgUrl&&!it._textoImg){
        try{it._textoImg=await _gpLoadImg(it.bpImgUrl);}
        catch(e){console.warn('No se pudo cargar imagen texto:',e);}
      }
    }
  }
}

function gpShuffleAlts(){
  for(const sec of GP.secciones){
    for(const item of sec.items){
      if(item.tipo!=='alternativas') continue;
      const correctIdx=item.bpSolAlt;
      if(correctIdx<0) continue; // sin respuesta correcta definida
      const alts=item.alts||[];
      const n=alts.filter(a=>(a||'').trim()).length;
      if(n<2) continue;
      const altImgs=item.altImgs||Array(5).fill(null);
      // Fisher-Yates sobre los primeros n elementos
      const perm=Array.from({length:n},(_,i)=>i);
      for(let i=n-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [perm[i],perm[j]]=[perm[j],perm[i]];
      }
      item.alts=[...perm.map(i=>alts[i]),...Array(5-n).fill('')];
      item.altImgs=[...perm.map(i=>altImgs[i]||null),...Array(5-n).fill(null)];
      const newCorrect=perm.indexOf(correctIdx);
      item.bpSolAlt=newCorrect;
      item.altCorrecta=newCorrect;
    }
  }
}

// Detecta si un ítem requiere LaTeX (MathJax) o puede renderizarse como texto nativo
function gpHasLatex(item){
  if((item.e||'').includes('$'))return true;
  if((item.ePost||'').includes('$'))return true;
  if((item.si||[]).some(s=>(s||'').includes('$')))return true;
  if((item.alts||[]).some(a=>(a||'').includes('$')))return true;
  return false;
}
function gpCanNative(item){
  return !gpHasLatex(item)&&!item.imgData&&!item.bpImgUrl;
}

function gpBinarize(canvas,thresh=210){
  const ctx=canvas.getContext('2d');
  const d=ctx.getImageData(0,0,canvas.width,canvas.height);
  const px=d.data;
  for(let i=0;i<px.length;i+=4){
    const g=0.299*px[i]+0.587*px[i+1]+0.114*px[i+2];
    const v=g<thresh?0:255;
    px[i]=px[i+1]=px[i+2]=v;px[i+3]=255;
  }
  ctx.putImageData(d,0,0);
}

async function gpPrerenderAll(nc){
  await MathJax.startup.promise;
  const mmToPx=3.7795,colWpx=Math.round(gpTW(nc)*mmToPx),fsPt=gpFSn(nc);
  const box=document.createElement('div');
  box.style.cssText=`position:fixed;top:0;left:${-(colWpx+20)}px;width:${colWpx}px;background:#fff;z-index:9999;padding:0;margin:0`;
  document.body.appendChild(box);
  const imgs=[];
  for(const sec of GP.secciones){
    for(const item of sec.items){
      if(item.tipo==='texto') continue; // texto se dibuja directamente en PDF
      // Sin LaTeX ni imagen adjunta → marcar para renderizado nativo (texto vectorial)
      if(gpCanNative(item)){imgs.push({native:true});continue;}
      const itemTexts=[item.e,item.ePost,...(item.si||[]),...(item.alts||[])];
      const itemFsPt=gpEffectiveFsPt(itemTexts,fsPt);
      if(item.tipo==='alternativas'){
        // Render enunciado y alternativas por separado para el algoritmo de corte de columna
        box.innerHTML=gpBuildEnunciadoHTML(item,itemFsPt);
        await MathJax.typesetPromise([box]);
        const canvasE=await html2canvas(box,{scale:4,backgroundColor:'#ffffff',logging:false,useCORS:true});
        gpBinarize(canvasE);
        const hE=canvasE.height/(mmToPx*4);
        box.innerHTML=gpBuildAltsHTML(item,itemFsPt);
        await MathJax.typesetPromise([box]);
        const canvasA=await html2canvas(box,{scale:4,backgroundColor:'#ffffff',logging:false,useCORS:true});
        gpBinarize(canvasA);
        const hA=canvasA.height/(mmToPx*4);
        imgs.push({urlE:canvasE.toDataURL('image/png'),hE,urlA:canvasA.toDataURL('image/png'),hA,wMm:gpTW(nc),split:true});
      } else {
        box.innerHTML=gpBuildQHTML(item,itemFsPt);
        await MathJax.typesetPromise([box]);
        const canvas=await html2canvas(box,{scale:4,backgroundColor:'#ffffff',logging:false,useCORS:true});
        gpBinarize(canvas);
        imgs.push({url:canvas.toDataURL('image/png'),wMm:gpTW(nc),hMm:canvas.height/(mmToPx*4),split:false});
      }
    }
  }
  document.body.removeChild(box);
  return imgs;
}

/* ── Carátula ── */
function gpDrawCaratula(doc,titulo,materia,fecha,tiempo,logoB64){
  const W=210,H=297;
  // Fondo blanco (mínimo consumo de tinta)
  doc.setFillColor(255,255,255);doc.rect(0,0,W,H,'F');
  // Franja gold superior
  doc.setFillColor(201,168,76);doc.rect(0,0,W,4,'F');
  // Franja gold inferior
  doc.setFillColor(201,168,76);doc.rect(0,H-4,W,4,'F');
  // Líneas verticales gold
  doc.setFillColor(201,168,76);doc.rect(12,0,0.7,H,'F');
  doc.setFillColor(201,168,76);doc.rect(W-12.7,0,0.7,H,'F');
  // Círculo decorativo
  doc.setDrawColor(201,168,76);doc.setLineWidth(0.3);
  doc.ellipse(W/2,110,52,52,'S');
  doc.setLineWidth(0.15);
  doc.ellipse(W/2,110,57,57,'S');
  // ── Dentro del círculo (y=58 a y=162) ──
  // Nombre academia
  doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(160,128,40);
  doc.text('ACADEMIA PRE-CADETES',W/2,72,{align:'center'});
  // Institución
  doc.setFont('helvetica','bold');doc.setFontSize(20);doc.setTextColor(13,27,46);
  doc.text('CHARLY TÁCTICO',W/2,80,{align:'center'});
  doc.setFontSize(12);doc.setTextColor(160,128,40);
  doc.text('T  E  D  A  X',W/2,87,{align:'center'});
  // Logo (más pequeño para dejar espacio al título)
  if(logoB64){try{doc.addImage(logoB64,'PNG',W/2-13,90,26,26);}catch(e){}}
  // Separador fino interno
  doc.setDrawColor(180,185,195);doc.setLineWidth(0.2);
  doc.line(40,120,W-40,120);
  // Título práctica (dentro del círculo)
  // Título — auto-ajuste de fuente para no desbordarse del círculo
  const tituloUp=(titulo||'PRÁCTICA').toUpperCase();
  doc.setFont('helvetica','bold');
  let tFz=14,tLines=[];
  for(const fs of [14,12,10,9]){doc.setFontSize(fs);tLines=doc.splitTextToSize(tituloUp,84);tFz=fs;if(tLines.length<=3)break;}
  doc.setTextColor(13,27,46);
  doc.text(tLines,W/2,129,{align:'center'});
  const afterTitle=129+tLines.length*(tFz*0.5+0.5);
  // Fecha (dentro del círculo)
  if(fecha){doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(60,80,100);doc.text(fecha,W/2,afterTitle+4,{align:'center'});}
  // Duración (dentro del círculo)
  if(tiempo){doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(90,100,115);doc.text(tiempo+' minutos',W/2,afterTitle+(fecha?11:4),{align:'center'});}
  // Separador gold (debajo del círculo)
  doc.setDrawColor(201,168,76);doc.setLineWidth(0.6);
  doc.line(22,168,W-22,168);
  // Materia (fuera del círculo, si existe)
  if(materia){doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(40,60,85);doc.text(materia.toUpperCase(),W/2,178,{align:'center'});}
  // Separador 2
  doc.setDrawColor(190,190,200);doc.setLineWidth(0.3);
  doc.line(22,materia?186:174,W-22,materia?186:174);
  // ── CAJA DATOS DEL ESTUDIANTE ──
  const cX=18,cY=210,cW=W-36,cH=66;
  doc.setFillColor(255,255,255);doc.setDrawColor(201,168,76);doc.setLineWidth(0.8);
  doc.rect(cX,cY,cW,cH,'FD');
  // Header caja (gris claro en vez de navy)
  doc.setFillColor(240,240,242);doc.rect(cX,cY,cW,11,'F');
  doc.setFillColor(201,168,76);doc.rect(cX,cY+11,cW,0.5,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(13,27,46);
  doc.text('DATOS DEL ESTUDIANTE',W/2,cY+7.5,{align:'center'});
  // Campos
  const fL=cX+8,fR=cX+cW-8;
  let fy=cY+21;
  const field=(label,x1,x2,y)=>{
    doc.setFont('helvetica','bold');doc.setFontSize(6.2);doc.setTextColor(90,90,110);
    doc.text(label,x1,y);
    doc.setDrawColor(170,175,190);doc.setLineWidth(0.3);
    doc.line(x1,y+6.5,x2,y+6.5);
  };
  // Fila 1: Apellidos y Nombres
  field('APELLIDOS Y NOMBRES',fL,fR,fy);fy+=15;
  // Fila 2: DNI | Nota
  const w2=(cW-16)/2;
  field('DNI',fL,fL+w2-4,fy);
  field('NOTA',fL+w2,fR,fy);fy+=15;
  // Fila 3: Firma del estudiante | Fecha entrega
  field('FIRMA DEL ESTUDIANTE',fL,fL+w2-4,fy);
  field('FECHA DE ENTREGA',fL+w2,fR,fy);
  // Pie de página carátula
  doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.setTextColor(100,100,120);
  doc.text('Prohibida la reproducción parcial o total sin autorización de Charly Táctico TEDAX.',W/2,H-9,{align:'center'});
}

/* ── PDF generation ── */
async function generarPracticaPDF(){
  const btn=document.getElementById('gp-btn-gen');
  const status=document.getElementById('gp-status');
  if(!btn)return;
  const totalQ=GP.secciones.reduce((s,sec)=>s+sec.items.filter(it=>it.tipo!=='texto').length,0);
  if(!totalQ){await myAlert('Agrega al menos una pregunta.');return;}
  btn.disabled=true;status.textContent='Iniciando...';
  try{
    gpCalcLayout();
    const nc=GP.layout.cols;
    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const cw=gpCW(nc),colXs=Array.from({length:nc},(_,i)=>gpCX(nc,i));
    const titulo=GP.cfg.titulo||'Práctica';
    const fechaHoy=new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'long',year:'numeric'});
    const fechaPrac=GP.cfg.fecha?new Date(GP.cfg.fecha+'T12:00:00').toLocaleDateString('es-PE',{day:'2-digit',month:'long',year:'numeric'}):fechaHoy;
    const matNombre=GP.secciones.length===1?GP.secciones[0].nombre:'';

    // Logo
    const logoB64=await new Promise(res=>{
      const img=new Image();img.crossOrigin='anonymous';
      img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);res(c.toDataURL('image/png'));};
      img.onerror=()=>res(null);img.src='icono_final.png';
    });
    // Marca de agua — texto vectorial con GState opacity (no rasteriza, imprime limpio en laser)

    // ── CARÁTULA ──────────────────────────────────────────────
    if(GP.cfg.caratula){
      gpDrawCaratula(doc,titulo,matNombre,fechaPrac,GP.cfg.tiempo,logoB64);
      doc.addPage();
    }

    // ── HEADER limpio — sin fondos ni imágenes (vectorial puro, imprime bien en laser) ──
    const HDR=18;
    const matLabel=GP.secciones.length===1?' — '+GP.secciones[0].nombre.toUpperCase():'';
    const totalPts=GP.secciones.reduce((s,sec)=>s+sec.items.reduce((ss,it)=>ss+(it.tipo!=='texto'?(+it.p||0):0),0),0);
    doc.setTextColor(0,0,0);
    doc.setFont('helvetica','bold');doc.setFontSize(9);
    doc.text('ACADEMIA CHARLY TÁCTICO TEDAX',gpPW/2,7,{align:'center'});
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    doc.text((titulo+matLabel).toUpperCase(),gpPW/2,12,{align:'center',maxWidth:gpPW-gpML-gpMR-40});
    doc.setFontSize(7);doc.setTextColor(0,0,0);
    doc.text(fechaPrac,gpPW-gpMR,7,{align:'right'});
    if(GP.cfg.tiempo)doc.text(GP.cfg.tiempo+' min',gpPW-gpMR,12,{align:'right'});
    if(GP.cfg.mostrarPts&&totalPts){doc.setFontSize(7);doc.setTextColor(0,0,0);doc.text('Total: '+totalPts+' pts',gpML,12);}
    doc.setDrawColor(0,0,0);doc.setLineWidth(0.3);
    doc.line(gpML,HDR,gpPW-gpMR,HDR);

    // ── INSTRUCCIONES ─────────────────────────────────────────
    let curY=HDR+5;
    const istr=GP.cfg.instrucciones||'';
    if(istr){
      const iL=doc.splitTextToSize(istr,gpPW-gpML-gpMR);
      doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(20,20,20);
      doc.text('INSTRUCCIONES:',gpML,curY+4);
      doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(50,50,50);
      doc.text(iL,gpML,curY+9);
      curY+=iL.length*4.5+14;
    }

    const firstTop=curY;let curCol=0,colTop=firstTop;curY=firstTop;
    const drawSeps=(topY)=>{
      if(nc<2||!GP.cfg.separadorCols)return;
      for(let c=1;c<nc;c++){
        const x=colXs[c]-gpGAP/2;
        doc.setDrawColor(0,0,0);doc.setLineWidth(0.15);
        doc.line(x,topY,x,gpFOOT);
      }
    };
    drawSeps(firstTop);
    const drawMini=()=>{
      const MH=8;
      doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(0,0,0);
      doc.text('CHARLY TACTICO TEDAX',gpML,5.5);
      doc.setFont('helvetica','normal');doc.setTextColor(0,0,0);
      doc.text(titulo,gpPW/2,5.5,{align:'center'});
      doc.text(fechaHoy,gpPW-gpMR,5.5,{align:'right'});
      doc.setDrawColor(0,0,0);doc.setLineWidth(0.3);
      doc.line(gpML,MH,gpPW-gpMR,MH);
    };
    const moveNext=()=>{
      curCol++;
      if(curCol>=nc){curCol=0;doc.addPage();drawMini();colTop=10;drawSeps(10);}
      curY=colTop;
    };

    // Pre-cargar imágenes de bloques texto base
    status.textContent='Cargando imágenes de lectura...';
    await gpPreloadTextoImgs();

    // Mezclar orden de alternativas (la correcta se rastrea y actualiza en bpSolAlt)
    gpShuffleAlts();

    // Pre-render LaTeX
    status.textContent='Renderizando LaTeX...';
    const imgs=await gpPrerenderAll(nc);
    let imgIdx=0;

    const drawTexto=(item)=>{
      if(!item.texto?.trim()&&!item._textoImg)return;
      // Usar gpTW(nc) como ancho del texto — igual que preguntas, garantiza no overflow
      const tw=gpTW(nc);
      const txX=2; // offset desde inicio de columna
      const lh=gpLHn(nc);
      const fs=gpFSn(nc)-0.5;
      // Imagen del texto (e.g. lectura escaneada subida como imagen)
      if(item._textoImg){
        const{b64,w,h}=item._textoImg;
        const imgH=Math.round((tw/w)*h);
        if(curY+imgH+2>gpFOOT)moveNext();
        doc.addImage(b64,'PNG',colXs[curCol]+txX,curY,tw,imgH);
        curY+=imgH+4;
      }
      // Texto de la lectura
      if(item.texto?.trim()){
        // Normalizar: colapsar saltos PDF, párrafos reales, limpiar líneas vacías
        const textoNorm=item.texto.trim()
          .replace(/\r\n/g,'\n').replace(/[ \t]+/g,' ')
          .replace(/\n[ \t]*\n/g,'\x00')   // línea vacía (con o sin espacios) → marca de párrafo
          .replace(/\n/g,' ')               // salto simple (ajuste de línea PDF) → espacio
          .replace(/\x00+/g,'\n')           // colapsar párrafos múltiples → uno
          .split('\n').map(p=>p.trim()).filter(p=>p).join('\n')  // eliminar párrafos vacíos
          .replace(/ {2,}/g,' ');
        // Setear font ANTES de splitTextToSize (usa métricas del font activo)
        doc.setFont('helvetica','italic');doc.setFontSize(fs);doc.setTextColor(20,20,20);
        const alh=fs*1.15*(25.4/72);
        const allLines=doc.splitTextToSize(textoNorm,tw);
        let remaining=[...allLines];
        while(remaining.length){
          // Re-aplicar font tras moveNext (drawMini cambia tamaño)
          doc.setFont('helvetica','italic');doc.setFontSize(fs);doc.setTextColor(20,20,20);
          const cx=colXs[curCol];
          const avail=gpFOOT-curY;
          const maxLines=Math.max(1,Math.floor((avail-alh)/alh));
          const chunk=remaining.splice(0,maxLines);
          // Renderizar línea por línea con Y explícita (evita drift de jsPDF)
          chunk.forEach((line,i)=>doc.text(line,cx+txX,curY+alh*0.5+i*alh));
          curY+=chunk.length*alh+(remaining.length?0:0.5);
          if(remaining.length)moveNext();
        }
      }
    };

    // Renderizado nativo (sin html2canvas) para preguntas sin LaTeX ni imágenes
    // Produce texto vectorial: imprime continuo en laser, igual que el texto de lectura
    const drawQNative=(item,num)=>{
      const ind=gpIND[nc],fs=gpFSn(nc),lh=gpLHn(nc),tw=cw-ind-1;
      doc.setFont('helvetica','normal');doc.setFontSize(fs);
      const _rawE=(item.e||'').trim()
        .replace(/\r\n/g,'\n').replace(/[ \t]+/g,' ')
        .replace(/\n[ \t]*\n/g,' ').replace(/\n/g,' ').replace(/ {2,}/g,' ');
      const _eText=_rawE.replace(/^seleccione\s+el\s+(sin[oó]nimo|ant[oó]nimo)\s+de\s+la\s+palabra\s*:\s*/i,'');
      const eLines=doc.splitTextToSize(_eText,tw);
      let altFlat=[];
      if(item.tipo==='alternativas'){
        const n=item.numAlts||5;
        ['A','B','C','D','E'].slice(0,n).forEach((L,i)=>{
          const txt=(item.alts||[])[i]||'';
          doc.splitTextToSize(L+') '+txt,tw).forEach(l=>altFlat.push(l));
        });
      } else {
        (item.si||[]).forEach((si,i)=>{
          doc.splitTextToSize(String.fromCharCode(97+i)+') '+(si||''),tw).forEach(l=>altFlat.push(l));
        });
      }
      const totalH=1+eLines.length*lh+(altFlat.length?lh*0.5+altFlat.length*lh:0)+1;
      if(curY+totalH>gpFOOT)moveNext();
      const cx=colXs[curCol];
      // Número de pregunta y puntaje
      doc.setFont('helvetica','bold');doc.setFontSize(nc===1?10:9);doc.setTextColor(0,0,0);
      doc.text(String(num)+'.',cx+1,curY+fs*0.35+1);
      if(GP.cfg.mostrarPts&&item.p){
        doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(80,80,80);
        doc.text('('+item.p+'pt'+(item.p>1?'s':'')+')',cx+cw,curY+fs*0.35+1,{align:'right'});
      }
      curY+=1;
      // Enunciado
      doc.setFont('helvetica','normal');doc.setFontSize(fs);doc.setTextColor(20,20,20);
      eLines.forEach((line,i)=>doc.text(line,cx+ind,curY+(i+0.85)*lh));
      curY+=eLines.length*lh;
      // Alternativas / sub-ítems
      if(altFlat.length){
        curY+=lh*0.4;
        altFlat.forEach(line=>{
          if(curY+lh>gpFOOT)moveNext();
          doc.setFont('helvetica','normal');doc.setFontSize(fs);doc.setTextColor(20,20,20);
          doc.text(line,colXs[curCol]+ind,curY+lh*0.85);
          curY+=lh;
        });
      }
      curY+=1;
    };

    const drawSubtema=(nombre)=>{
      const dh=5;
      if(curY+dh>gpFOOT)moveNext();
      const cx=colXs[curCol];
      const mid=curY+3;
      doc.setFont('helvetica','bold');doc.setFontSize(nc===1?7:6.5);doc.setTextColor(20,20,20);
      const lbl=nombre.toUpperCase();
      const tw=doc.getTextWidth(lbl)+4;
      const lx=cx+(cw-tw)/2;
      const rx=lx+tw;
      doc.setDrawColor(0,0,0);doc.setLineWidth(.25);
      doc.line(cx,mid,lx-1,mid);
      doc.line(rx+1,mid,cx+cw,mid);
      doc.text(lbl,cx+cw/2,mid+0.5,{align:'center'});
      curY+=dh+1;
    };

    const drawQ=(item,num)=>{
      const img=imgs[imgIdx++];
      if(img.native){drawQNative(item,num);return;}
      const ind=gpIND[nc];
      const _drawNum=(cx)=>{
        doc.setFont('helvetica','bold');doc.setFontSize(nc===1?10:9);doc.setTextColor(0,0,0);
        doc.text(String(num)+'.',cx+1,curY+gpFSn(nc)*0.35+1);
        if(GP.cfg.mostrarPts&&item.p){
          doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(80,80,80);
          doc.text('('+item.p+'pt'+(item.p>1?'s':'')+')',cx+cw,curY+gpFSn(nc)*0.35+1,{align:'right'});
        }
      };
      if(!img.split){
        // Item sin alternativas (enunciado solo)
        const h=2+img.hMm+1;
        if(curY+h>gpFOOT)moveNext();
        const cx=colXs[curCol];_drawNum(cx);
        doc.addImage(img.url,'PNG',cx+ind,curY,img.wMm,img.hMm);
        curY+=h;
        return;
      }
      // Item con alternativas — algoritmo de corte de columna
      const hFull=2+img.hE+img.hA+1;
      const hEnc=2+img.hE;
      if(curY+hFull<=gpFOOT){
        // Cabe entero
        const cx=colXs[curCol];_drawNum(cx);
        doc.addImage(img.urlE,'PNG',cx+ind,curY,img.wMm,img.hE);
        doc.addImage(img.urlA,'PNG',cx+ind,curY+img.hE,img.wMm,img.hA);
        curY+=hFull;
      } else if(curY+hEnc<=gpFOOT){
        // Corte: enunciado en columna actual, alternativas en la siguiente
        const cx=colXs[curCol];_drawNum(cx);
        doc.addImage(img.urlE,'PNG',cx+ind,curY,img.wMm,img.hE);
        curY+=hEnc;moveNext();
        doc.addImage(img.urlA,'PNG',colXs[curCol]+ind,curY,img.wMm,img.hA);
        curY+=img.hA+1;
      } else {
        // Ni el enunciado cabe — mover todo a siguiente columna
        moveNext();
        const cx=colXs[curCol];_drawNum(cx);
        doc.addImage(img.urlE,'PNG',cx+ind,curY,img.wMm,img.hE);
        doc.addImage(img.urlA,'PNG',cx+ind,curY+img.hE,img.wMm,img.hA);
        curY+=hFull;
      }
    };

    const drawDiv=(nombre)=>{
      const dh=8;
      if(curY+dh>gpFOOT)moveNext();
      const cx=colXs[curCol];
      doc.setDrawColor(0,0,0);doc.setLineWidth(.3);
      doc.line(cx,curY,cx+cw,curY);doc.line(cx,curY+dh,cx+cw,curY+dh);
      doc.setFont('helvetica','bold');doc.setFontSize(nc===1?8:7);doc.setTextColor(20,20,20);
      doc.text(nombre.toUpperCase(),cx+cw/2,curY+5.2,{align:'center'});
      curY+=dh+2;
    };

    status.textContent='Compilando PDF...';
    const multi=GP.secciones.length>1;
    let gnum=1;
    GP.secciones.forEach(sec=>{
      if(multi)drawDiv(sec.nombre);
      const isRV=/verbal|razonamiento/i.test(sec.nombre);
      let prevSubtema=null,prevWasQ=false;
      sec.items.forEach(item=>{
        if(item.tipo==='texto'){
          if(prevWasQ)curY+=6;
          const _sub=item.bpSubtema||item.etiqueta||'';
          if(_sub&&_sub!=='Lectura'&&_sub!=='Texto'&&_sub!==prevSubtema){
            drawSubtema(_sub);
            prevSubtema=_sub;
          }
          drawTexto(item);
          prevWasQ=false;
        }else{
          if(isRV&&!item.bpEsSubitem&&item.bpSubtema&&item.bpSubtema!==prevSubtema){
            drawSubtema(item.bpSubtema);
            prevSubtema=item.bpSubtema;
          }
          drawQ(item,gnum++);
          prevWasQ=true;
        }
      });
    });

    // ── 1. Registrar cuántas páginas tienen las preguntas ────────────────────
    const practicaPages=doc.getNumberOfPages();

    // ── 2. Footer de las páginas de preguntas ────────────────────────────────
    for(let i=1;i<=practicaPages;i++){
      doc.setPage(i);
      if(i===1&&GP.cfg.caratula) continue;
      if(GP.cfg.watermark){try{
        const _wmTxt='CHARLY TÁCTICO TEDAX';
        const _diag=Math.sqrt(gpPW*gpPW+297*297);
        const _angRad=Math.atan2(297,gpPW);
        const _angDeg=_angRad*(180/Math.PI);
        doc.setFont('helvetica','bold');doc.setFontSize(50);
        const _refW=doc.getTextWidth(_wmTxt);
        const _wmFs=(50*(_diag/_refW))*((GP.cfg.wmSize||70)/100);
        doc.setFontSize(_wmFs);
        const _tw=doc.getTextWidth(_wmTxt);
        // Punto de inicio para que el centro del texto quede en el centro de la hoja
        const _sx=gpPW/2-(_tw/2)*Math.cos(_angRad);
        const _sy=297/2+(_tw/2)*Math.sin(_angRad);
        doc.setGState(new doc.GState({opacity:GP.cfg.wmOpacity||0.08}));
        doc.setFont('helvetica','bold');doc.setTextColor(0,0,0);
        doc.text(_wmTxt,_sx,_sy,{angle:_angDeg});
        doc.setGState(new doc.GState({opacity:1}));
      }catch(e){}}
      doc.setDrawColor(0,0,0);doc.setLineWidth(0.2);
      doc.line(gpML,gpFOOT+2,gpPW-gpMR,gpFOOT+2);
      doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(0,0,0);
      doc.text('Charly Táctico TEDAX — Academia Pre-Cadetes',gpML,gpFOOT+7);
      const cp=i-(GP.cfg.caratula?1:0),tp=practicaPages-(GP.cfg.caratula?1:0);
      doc.text(`${cp} / ${tp}`,gpPW/2,gpFOOT+7,{align:'center'});
      doc.text('El primer error es el último',gpPW-gpMR,gpFOOT+7,{align:'right'});
    }

    // ── 3. Plantilla (cartilla de burbujas + hoja docente con QR) ────────────
    const _plKey=gpBuildPlantillaKey();
    if(_plKey.split('').some(c=>c!=='-')){
      status.textContent='Agregando plantilla de respuestas...';
      gpAgregarPaginasPlantilla(doc,titulo,fechaHoy,_plKey);
    }
    const plantillaEndPage=doc.getNumberOfPages();

    // ── 4. Solucionario: solo preguntas con desarrollo del banco ─────────────
    // Construir mapa solo con bpSolTipo==='desarrollo' que tengan contenido
    const devMap=[];let qn2=1;
    GP.secciones.forEach(sec=>{
      sec.items.forEach(it=>{
        if(it.tipo!=='texto'){
          if(it.bpSolTipo==='desarrollo'&&it.bpSolDesarrollo?.trim())
            devMap.push({num:qn2,secNombre:sec.nombre,bpSolTipo:'desarrollo',bpSolDesarrollo:it.bpSolDesarrollo});
          qn2++;
        }
      });
    });
    if(devMap.length){
      status.textContent='Generando solucionario...';
      // Pre-renderizar desarrollos con MathJax
      await MathJax.startup.promise;
      const mmToPx=3.7795,devW=Math.round(gpTW(1)*mmToPx);
      const box=document.createElement('div');
      box.style.cssText=`position:fixed;top:0;left:${-(devW+20)}px;width:${devW}px;background:#fff;z-index:9999;padding:4px 2px`;
      document.body.appendChild(box);
      for(const q of devMap){
        const solFsPx=(9*(96/72)).toFixed(1);
        box.innerHTML=`<div style="font-family:Helvetica,Arial,sans-serif;font-size:${solFsPx}px;line-height:${(parseFloat(solFsPx)*1.6).toFixed(1)}px;color:#141e32;white-space:pre-wrap">${gpAddDisplayStyle(q.bpSolDesarrollo)}</div>`;
        await MathJax.typesetPromise([box]);
        const canvas=await html2canvas(box,{scale:2,backgroundColor:'#ffffff',logging:false,useCORS:true});
        q._devImg={url:canvas.toDataURL('image/png'),wMm:gpTW(1),hMm:canvas.height/(mmToPx*2)};
      }
      document.body.removeChild(box);
      await gpGenerarSolucionario(doc,devMap,titulo,fechaHoy);
      // Footer del solucionario
      const pcTotal=doc.getNumberOfPages();
      const solTotal=pcTotal-plantillaEndPage;
      for(let i=plantillaEndPage+1;i<=pcTotal;i++){
        doc.setPage(i);
        doc.setDrawColor(0,0,0);doc.setLineWidth(.3);doc.line(gpML,gpFOOT+2,gpPW-gpMR,gpFOOT+2);
        doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(0,0,0);
        doc.text('SOLUCIONARIO — Uso Interno',gpML,gpFOOT+7);
        doc.text(`S${i-plantillaEndPage}/${solTotal}`,gpPW/2,gpFOOT+7,{align:'center'});
      }
    }

    const slug=titulo.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').toLowerCase();
    doc.save(`practica_${slug}_${GP.cfg.fecha||new Date().toISOString().slice(0,10)}.pdf`);
    status.textContent='PDF generado.';
  }catch(err){status.textContent='Error: '+err.message;console.error(err);}
  btn.disabled=false;
}

/* ── Plantilla de respuestas para Armar Práctica ──────────────────────────── */
function gpBuildPlantillaKey(){
  // Devuelve 100 chars: 'A'/'B'/'C'/'D'/'E' solo si tiene solución tipo 'alternativa', '-' resto
  // Usa bpSolAlt post-shuffle — debe llamarse DESPUÉS de gpShuffleAlts (dentro de generarPracticaPDF)
  const key=Array(100).fill('-');
  let qNum=0;
  GP.secciones.forEach(sec=>{
    sec.items.forEach(item=>{
      if(item.tipo==='texto')return;
      if(qNum>=100)return;
      if(item.bpSolTipo==='alternativa'){
        const idx=item.bpSolAlt??-1;
        if(idx>=0&&idx<=4)key[qNum]='ABCDE'[idx];
      }
      qNum++;
    });
  });
  return key.join('');
}

// Construye mapa de secciones para el QR extendido (100 chars, dígito = índice de sección)
function gpBuildSectionMap(){
  const map=[];
  let qNum=0;
  GP.secciones.forEach((sec,si)=>{
    sec.items.forEach(item=>{
      if(item.tipo==='texto')return;
      if(qNum>=100)return;
      map.push(Math.min(si,9).toString());
      qNum++;
    });
  });
  while(map.length<100)map.push('0');
  return map.join('');
}

// Agrega páginas de cartilla + hoja docente al doc existente (no crea PDF separado)
function gpAgregarPaginasPlantilla(doc,titulo,fecha,key){
  // Recibe el doc existente y agrega páginas — no crea ni guarda PDF nuevo
  const PW=210,M=8;
  const BLK=[0,0,0],GRY=[100,100,100],LGT=[180,180,180];
  // Layout IDÉNTICO al de omr_server.py (CL) y CART_LAYOUT de vocab — NO modificar sin actualizar ambos
  const GX=10,GY=70,GW=190,RM=5,HDR=6,RH=7,QW=8,BA=11,BS=6.5,BR=2.5,GAP=5;
  const DNI_X=10,DNI_Y=27,DNI_LW=7,DNI_SH=5,DNI_SV=4,DNI_BR=1.4;
  const CONT_W=GW-2*RM,GRP_W=(CONT_W-3*GAP)/4,CX0=GX+RM;
  const activeCount=key.split('').filter(c=>c!=='-').length;
  function _qrDU(text){const q=qrcode(0,'M');q.addData(text);q.make();return q.createDataURL(12,0);}
  // Si hay más de una sección, codificar mapa de áreas en el QR
  const _hasSecs = GP.secciones.length > 1;
  const _secMap  = _hasSecs ? gpBuildSectionMap() : null;
  const _secNoms = _hasSecs ? GP.secciones.map(s=>(s.nombre||'Área').replace(/[|~]/g,' ')).join('~') : null;
  const _qrText  = _hasSecs ? `CTP|100|${key}|${_secMap}|${_secNoms}` : `CTP|100|${key}`;
  const qrDU=_qrDU(_qrText);
  // ── HOJA CARTILLA (fotocopiar y distribuir a alumnos) ──────────────────────
  doc.addPage();
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...BLK);
  doc.text('ACADEMIA CHARLY TÁCTICO TEDAX',PW/2,M+4,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...GRY);
  doc.text('PLANTILLA DE RESPUESTAS — '+titulo.toUpperCase(),PW/2,M+9,{align:'center'});
  doc.setFontSize(7);doc.text(fecha,PW-M,M+4,{align:'right'});
  doc.setDrawColor(...LGT);doc.setLineWidth(0.2);doc.line(M,M+11,PW-M,M+11);
  // Marcas de registro 7×7mm a 3mm del borde
  const MK=7,MP=3;
  doc.setFillColor(0,0,0);
  doc.rect(MP,MP,MK,MK,'F');doc.rect(210-MP-MK,MP,MK,MK,'F');
  doc.rect(MP,297-MP-MK,MK,MK,'F');doc.rect(210-MP-MK,297-MP-MK,MK,MK,'F');
  // ── Sección DNI ──────────────────────────────────────────────
  doc.setDrawColor(...LGT);doc.setLineWidth(0.2);
  doc.rect(DNI_X-1, DNI_Y-DNI_SV/2-5, DNI_LW+8*DNI_SH+2, 10*DNI_SV+7,'S');
  doc.setFont('helvetica','bold');doc.setFontSize(5.5);doc.setTextColor(...GRY);
  doc.text('DNI DEL ALUMNO',DNI_X,DNI_Y-DNI_SV-1.5);
  doc.setFont('helvetica','normal');doc.setFontSize(5);doc.setTextColor(160,160,160);
  for(let d=0;d<8;d++) doc.text(`${d+1}`,DNI_X+DNI_LW+d*DNI_SH,DNI_Y-DNI_BR-1,{align:'center'});
  doc.setFont('helvetica','bold');doc.setFontSize(5.5);doc.setTextColor(...GRY);
  for(let v=0;v<10;v++) doc.text(`${v}`,DNI_X+DNI_LW-2,DNI_Y+v*DNI_SV+1.5,{align:'right'});
  doc.setDrawColor(60,60,60);doc.setLineWidth(0.35);
  for(let d=0;d<8;d++) for(let v=0;v<10;v++) doc.circle(DNI_X+DNI_LW+d*DNI_SH,DNI_Y+v*DNI_SV,DNI_BR,'S');
  doc.setDrawColor(...LGT);doc.setLineWidth(0.2);doc.rect(GX,GY,GW,200,'S');
  for(let g=0;g<4;g++){
    const gx=CX0+g*(GRP_W+GAP),q0=g*25;
    const hY=GY+RM+HDR-1.5;
    doc.setFont('helvetica','bold');doc.setFontSize(6);doc.setTextColor(...GRY);
    ['A','B','C','D','E'].forEach((l,ci)=>doc.text(l,gx+BA+ci*BS,hY,{align:'center'}));
    for(let r=0;r<25;r++){
      const qi=q0+r,ry=GY+RM+HDR+r*RH,cy=ry+RH/2;
      const k=key[qi]||'-',active=k!=='-';
      if(active){if(r%2===0){doc.setFillColor(255,252,230);doc.rect(gx,ry,GRP_W,RH,'F');}}
      else{doc.setFillColor(242,242,242);doc.rect(gx,ry,GRP_W,RH,'F');}
      doc.setFont('helvetica',active?'bold':'normal');doc.setFontSize(6.5);
      doc.setTextColor(...(active?BLK:[200,200,200]));
      doc.text(`${qi+1}`,gx+QW-1.5,cy+2,{align:'right'});
      if(active){
        doc.setDrawColor(60,60,60);doc.setLineWidth(0.35);
        for(let ci=0;ci<5;ci++)doc.circle(gx+BA+ci*BS,cy,BR,'S');
      } else {
        doc.setDrawColor(210,210,210);doc.setLineWidth(0.2);
        doc.line(gx+BA-2,cy,gx+BA+4*BS+2,cy);
      }
    }
  }
  // ── HOJA DOCENTE (solo para el evaluador — contiene QR con clave) ──────────
  const QR_SZ=70;
  doc.addPage();
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...BLK);
  doc.text('ACADEMIA CHARLY TÁCTICO TEDAX',PW/2,M+4,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...GRY);
  doc.text('HOJA DOCENTE — '+titulo.toUpperCase(),PW/2,M+9,{align:'center'});
  doc.setFontSize(7);doc.text(fecha,PW-M,M+4,{align:'right'});
  doc.setDrawColor(...LGT);doc.setLineWidth(0.2);doc.line(M,M+11,PW-M,M+11);
  doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(40,40,40);
  doc.text('CONFIDENCIAL — NO DISTRIBUIR AL ALUMNO',PW/2,M+17,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...GRY);
  const _modeLabel = _hasSecs
    ? `${activeCount} preguntas · ${GP.secciones.length} áreas (${GP.secciones.map(s=>s.nombre||'Área').join(', ')})`
    : `${activeCount} preguntas con alternativas (A–E)`;
  doc.text(_modeLabel,PW/2,M+22,{align:'center'});
  const qrX=(PW-QR_SZ)/2,qrYY=M+26;
  doc.addImage(qrDU,'PNG',qrX,qrYY,QR_SZ,QR_SZ);
  doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...GRY);
  doc.text('Escanear con app Charly Táctico → Escáner Cartilla',PW/2,qrYY+QR_SZ+5,{align:'center'});
  const kyY=qrYY+QR_SZ+14;
  doc.setDrawColor(...LGT);doc.setLineWidth(0.25);doc.line(M,kyY,PW-M,kyY);
  doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...BLK);
  doc.text('CLAVE DE RESPUESTAS',PW/2,kyY+6,{align:'center'});
  const KPL=10,cellWk=(PW-2*M)/KPL;
  let numP=0;
  key.split('').forEach((k,qi)=>{
    if(k==='-')return;
    const row=Math.floor(numP/KPL),c2=numP%KPL;
    const kx=M+c2*cellWk,ky2=kyY+10+row*5.5;
    doc.setFont('helvetica','normal');doc.setTextColor(...GRY);doc.text(`${qi+1}.`,kx,ky2+3);
    doc.setFont('helvetica','bold');doc.setTextColor(...BLK);doc.text(k,kx+8,ky2+3);
    numP++;
  });
  // sin doc.save() — el llamador guarda el PDF completo
}
// ── Toast global ─────────────────────────────────────────────────────────────
let _toastTimer=null;
function showToast(msg,color='var(--gold)'){
  const t=document.getElementById('toast-global');if(!t)return;
  if(_toastTimer)clearTimeout(_toastTimer);
  t.textContent=msg;t.style.borderColor=color;t.style.display='block';
  requestAnimationFrame(()=>{t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';});
  _toastTimer=setTimeout(()=>{
    t.style.opacity='0';t.style.transform='translateX(-50%) translateY(-16px)';
    setTimeout(()=>{t.style.display='none';},260);
  },4000);
}
// ── BANCO DE PREGUNTAS ────────────────────────────────────────────────────────
const BP={
  init:false,tab:'gestionar',mats:[],subtemas:{},
  ed:null,fMat:'',fSub:'',fTxt:'',lista:[],listaConteo:[],listaRand:[],sel:new Set(),saving:false,randSubtemas:[],_txtTimer:null
};
const BPINP=`background:var(--navy);border:1px solid var(--border);color:var(--white);font-family:'Barlow',sans-serif;font-size:13px;padding:8px 12px;outline:none;width:100%;box-sizing:border-box`;
const BPLBL=`font-size:11px;font-weight:700;color:var(--gold);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block`;

function bpJoinLines(lines){
  // Une líneas: si termina en guion (corte de palabra) lo elimina y une directo,
  // si no termina en guion agrega un espacio entre líneas.
  return lines.reduce((acc,line,i)=>{
    if(i===0)return line;
    if(acc.endsWith('-'))return acc.slice(0,-1)+line;
    return acc+' '+line;
  },'').trim();
}

function bpParsearAlternativas(texto){
  // Soporta A. B. C. D. E. y A) B) C) D) E) — de 2 a 5 alternativas
  const lines=texto.split('\n').map(l=>l.trim()).filter(l=>l!=='');
  const altIdx={};
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^([A-E])[.)]\s*(.*)/);
    if(m)altIdx[m[1]]={line:i,first:m[2]};
  }
  if(!altIdx['A'])return null;
  const letras=['A','B','C','D','E'].filter(l=>altIdx[l]);
  if(letras.length<2)return null;
  const firstLine=altIdx['A'].line;
  // Quitar número inicial del enunciado (ej: "871 El tema..." → "El tema...")
  const enunciadoRaw=bpJoinLines(lines.slice(0,firstLine));
  const enunciado=enunciadoRaw.replace(/^\d+\s+/,'');
  const alts=['','','','',''];
  for(let k=0;k<letras.length;k++){
    const L=letras[k];
    const idx=L.charCodeAt(0)-65;
    const start=altIdx[L].line;
    const end=k<letras.length-1?altIdx[letras[k+1]].line:lines.length;
    const altLines=[altIdx[L].first,...lines.slice(start+1,end)].filter(l=>l!=='');
    alts[idx]=bpJoinLines(altLines);
  }
  return{enunciado,alts,numAlts:letras.length};
}

function bpNormalizarEnunciado(){
  const ta=document.getElementById('bp-enunciado');
  if(!ta)return;
  ta.value=(ta.value||'')
    .replace(/\r\n/g,'\n').replace(/[ \t]+/g,' ')
    .replace(/\n{2,}/g,'\x00').replace(/\n/g,' ').replace(/\x00/g,'\n').trim();
  showToast('✓ Saltos de línea normalizados');
}
function bpOnPaste(e){
  const raw=e.clipboardData?.getData('text')||'';
  const parsed=bpParsearAlternativas(raw);
  if(!parsed){
    // No alternatives detected — normalize line breaks from PDF copy-paste
    e.preventDefault();
    const norm=(raw||'')
      .replace(/\r\n/g,'\n').replace(/[ \t]+/g,' ')
      .replace(/\n{2,}/g,'\x00').replace(/\n/g,' ').replace(/\x00/g,'\n').trim();
    const ta=e.target;
    const s=ta.selectionStart,en=ta.selectionEnd;
    ta.value=ta.value.slice(0,s)+norm+ta.value.slice(en);
    ta.selectionStart=ta.selectionEnd=s+norm.length;
    return;
  }
  e.preventDefault();
  bpLeerForm();
  BP.ed.enunciado_texto=parsed.enunciado;
  parsed.alts.forEach((a,i)=>{BP.ed.alts[i]=a;});
  if(parsed.numAlts)BP.ed.numAlts=parsed.numAlts;
  bpRenderUI();
  const n=parsed.numAlts||5;
  showToast('✓ Enunciado y alternativas A–'+['','','B','C','D','E'][n]+' detectadas y distribuidas automáticamente');
}

function bpOnPasteSub(e,idx){
  const raw=e.clipboardData?.getData('text')||'';
  const parsed=bpParsearAlternativas(raw);
  if(!parsed)return;
  e.preventDefault();
  bpLeerSubitems();
  BP.ed.subitems[idx].texto=parsed.enunciado;
  parsed.alts.forEach((a,j)=>{BP.ed.subitems[idx].alts[j]=a;});
  document.getElementById('bp-subitems-container').innerHTML=bpHtmlSubitems();
  showToast('✓ Sub-pregunta '+(idx+1)+': enunciado y alternativas distribuidas automáticamente');
}

async function bpIniciar(){
  if(!BP.init){
    if(!allMaterias.length)await loadMaterias();
    BP.mats=allMaterias.filter(m=>(m.sector||'aptitud_academica')!=='aptitud_fisica');
    BP.init=true;
    bpNueva();bpRenderUI();
    // Carga subtemas en background para no bloquear el render inicial
    bpRefreshSubtemas(null).then(()=>bpRenderUI()).catch(()=>{});
    return;
  }
  bpNueva();bpRenderUI();
}

async function bpRefreshSubtemas(matId){
  const targets=matId?BP.mats.filter(m=>m.id===matId):BP.mats;
  for(const m of targets){
    const{data}=await sb.from('banco_preguntas').select('subtema').eq('materia_id',m.id).not('subtema','is',null).neq('subtema','').range(0,9999);
    BP.subtemas[m.id]=[...new Set((data||[]).map(r=>r.subtema).filter(Boolean))];
  }
}

function bpNueva(){
  const mid=BP.mats[0]?.id||'';
  BP.ed={
    id:null,materia_id:mid,subtema:'',tipo:'simple',nivel:null,fuente:'',
    enunciado_texto:'',enunciado_imagen_url:null,enunciado_post:'',
    alts:['','','','',''],altImgs:[null,null,null,null,null],
    sol:{tipo:'alternativa',alt:-1,desarrollo:'',devImg:null},
    subitems:[]
  };
}

function bpShowTab(t){
  BP.tab=t;
  ['gestionar','explorar'].forEach(x=>{
    document.getElementById('bp-tab-'+x)?.classList.toggle('active',x===t);
    const p=document.getElementById('bp-pane-'+x);
    if(p)p.style.display=x===t?'':'none';
  });
  if(t==='explorar'){if(!BP.lista.length)bpCargarLista();else bpRenderLista();}
}

const BP_MAT_KEYS=/matem|aritm|álgebra|algebra|geometr|trigon|estad|razon.*mat/i;
function bpEsMatematica(matId){return BP_MAT_KEYS.test(BP.mats.find(m=>m.id===matId)?.nombre||'');}

function bpRenderUI(){
  const root=document.getElementById('bp-root');if(!root)return;
  const ed=BP.ed||{};
  const mid=ed.materia_id||'';
  const matOpts=BP.mats.map(m=>`<option value="${m.id}"${m.id===mid?'selected':''}>${gpEsc(m.nombre)}</option>`).join('');
  const dlOpts=(BP.subtemas[mid]||[]).map(s=>`<option value="${gpEsc(s)}">`).join('');
  const altLetras=['A','B','C','D','E'];

  root.innerHTML=`
<div class="ph"><div class="ph-left"><div class="eye">Academia</div><div class="ttl">BANCO DE PREGUNTAS</div></div></div>
<div class="aula-tabs">
  <div class="aula-tab ${BP.tab==='gestionar'?'active':''}" id="bp-tab-gestionar" onclick="bpShowTab('gestionar')">Gestionar</div>
  <div class="aula-tab ${BP.tab==='explorar'?'active':''}" id="bp-tab-explorar" onclick="bpShowTab('explorar')">Explorar / Enviar</div>
</div>

<!-- ── GESTIONAR ── -->
<div id="bp-pane-gestionar" style="${BP.tab==='gestionar'?'':'display:none'}">
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
    <div>
      <label style="${BPLBL}">Materia</label>
      <select id="bp-materia" style="${BPINP}" onchange="bpOnMateriaChange(this.value)">${matOpts}</select>
    </div>
    <div>
      <label style="${BPLBL}">Subtema</label>
      <input id="bp-subtema" list="bp-sub-dl" placeholder="Ej: Analogías, Silogismos..." style="${BPINP}" value="${gpEsc(ed.subtema||'')}"/>
      <datalist id="bp-sub-dl">${dlOpts}</datalist>
    </div>
    <div>
      <label style="${BPLBL}">Tipo de pregunta</label>
      <select id="bp-tipo" style="${BPINP}" onchange="bpOnTipoChange(this.value)">
        <option value="simple"${(ed.tipo||'simple')==='simple'?' selected':''}>Simple (alternativas A-E)</option>
        <option value="texto_base"${ed.tipo==='texto_base'?' selected':''}>Texto Base (RV – lectura)</option>
      </select>
    </div>
  </div>
  <div style="display:flex;gap:12px;margin-bottom:16px">
    <div id="bp-nivel-row" style="min-width:170px;${bpEsMatematica(mid)?'':'display:none'}">
      <label style="${BPLBL}">Nivel de dificultad</label>
      <select id="bp-nivel" style="${BPINP}">
        <option value="">— Sin nivel —</option>
        <option value="facil"${ed.nivel==='facil'?' selected':''}>Fácil</option>
        <option value="medio"${ed.nivel==='medio'?' selected':''}>Medio</option>
        <option value="dificil"${ed.nivel==='dificil'?' selected':''}>Difícil</option>
      </select>
    </div>
    <div style="flex:1">
      <label style="${BPLBL}">Fuente <span style="font-weight:400;color:#8aaac8;font-size:10px">(libro, examen, año, etc.)</span></label>
      <input id="bp-fuente" style="${BPINP}" placeholder="Ej: UNI 2023, Lumbreras cap.5, UNMSM 2021-I..." value="${gpEsc(ed.fuente||'')}"/>
    </div>
  </div>

  <!-- Enunciado / Texto de Lectura -->
  <div style="background:var(--navy2);border:1px solid ${ed.tipo==='texto_base'?'rgba(201,168,76,.5)':'var(--border)'};padding:16px;margin-bottom:14px">
    ${ed.tipo==='texto_base'
      ?`<label style="${BPLBL}">📖 Texto de Lectura &nbsp;<span style="color:#e55;font-size:12px">*</span> &nbsp;<span style="font-weight:400;color:#8aaac8;font-size:10px">Este texto aparece como encabezado en la práctica — es la lectura que los alumnos deben leer</span></label>
        ${ed.enunciado_imagen_url&&!ed.enunciado_texto?.trim()?`<div style="background:rgba(229,85,85,.1);border:1px solid #e55;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#e55">
          ⚠ Esta pregunta tiene el texto guardado como imagen. Para ahorrar espacio en el PDF, borra la imagen y <strong>pega el texto directamente en el campo de abajo</strong>.
        </div>`:''}
        ${!ed.enunciado_imagen_url&&!ed.enunciado_texto?.trim()&&ed.enunciado_post?.trim()?`<div style="background:rgba(229,85,85,.1);border:1px solid #e55;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#e55">
          ⚠ El texto de lectura está en el campo "Texto post-imagen" (más abajo). <strong>Córtalo y pégalo aquí</strong> para que aparezca correctamente en la práctica y el PDF.
        </div>`:''}
      `
      :`<label style="${BPLBL}">Enunciado &nbsp;<span style="font-weight:400;color:#8aaac8;font-size:10px">Acepta LaTeX: $x^2$ o $$formula$$</span></label>`
    }
    ${BP_FMT_BAR('bp-enunciado')}
    <textarea id="bp-enunciado" rows="${ed.tipo==='texto_base'?8:4}" style="${BPINP};resize:vertical;margin-bottom:4px" onpaste="bpOnPaste(event)" placeholder="${ed.tipo==='texto_base'?'Pega aquí el texto completo de la lectura...':''}">${gpEsc(ed.enunciado_texto||'')}</textarea>
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button onclick="bpNormalizarEnunciado()" title="Elimina saltos de línea simples (útil cuando se pega texto de un PDF)" style="font-size:10px;padding:3px 10px;background:none;border:1px solid var(--border);color:#8aaac8;cursor:pointer;border-radius:4px">Normalizar ↵</button>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
      <label class="btn btn-outline" style="cursor:pointer;font-size:11px;padding:5px 12px;margin:0">
        📷 Imagen enunciado<input type="file" accept="image/*" style="display:none" onchange="bpUploadEnunciado(this)">
      </label>
      ${ed.enunciado_imagen_url?`<span style="font-size:11px;color:#8aaac8">imagen adjunta <button onclick="bpQuitarImgEnunciado()" style="color:#e55;background:none;border:none;cursor:pointer">✕</button></span>`:'<span style="font-size:11px;color:#4a5a6a">sin imagen</span>'}
    </div>
    ${ed.enunciado_imagen_url?`<img src="${ed.enunciado_imagen_url}" style="max-width:240px;max-height:130px;object-fit:contain;border:1px solid var(--border);margin-bottom:8px;display:block">`:''}
    <label style="${BPLBL}">Texto post-imagen <span style="font-weight:400;color:#8aaac8;font-size:10px">(opcional — aparece debajo de la imagen, no como lectura principal)</span></label>
    ${ed.tipo==='texto_base'&&ed.enunciado_post?.trim()&&!ed.enunciado_texto?.trim()?`<div style="background:rgba(201,168,76,.12);border:1px solid var(--gold);padding:6px 10px;margin-bottom:6px;font-size:11px;color:var(--gold)">⚠ Para texto_base, el texto de lectura debe ir en el campo principal de arriba, no aquí.</div>`:''}
    <textarea id="bp-epost" rows="2" style="${BPINP};resize:vertical" placeholder="Texto que aparece después de la imagen...">${gpEsc(ed.enunciado_post||'')}</textarea>
  </div>

  <!-- SIMPLE: alternativas + solución -->
  <div id="bp-sec-simple" style="${(ed.tipo||'simple')==='simple'?'':'display:none'}">
    <div style="background:var(--navy2);border:1px solid var(--border);padding:16px;margin-bottom:14px">
      <label style="${BPLBL}">Alternativas</label>
      ${altLetras.map((L,i)=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-weight:700;color:var(--gold);min-width:22px">${L})</span>
        <input id="bp-alt-${i}" style="${BPINP}" placeholder="Alternativa ${L}..." value="${gpEsc((ed.alts||[])[i]||'')}"/>
        <label style="cursor:pointer;color:#8aaac8;font-size:13px;white-space:nowrap" title="Imagen alternativa ${L}">
          📷<input type="file" accept="image/*" style="display:none" onchange="bpUploadAlt(this,${i})">
        </label>
        ${(ed.altImgs||[])[i]?`<img src="${ed.altImgs[i]}" style="height:30px;width:auto;border:1px solid var(--border)">`:''}
      </div>`).join('')}
    </div>
    <div style="background:var(--navy2);border:1px solid var(--border);padding:16px;margin-bottom:14px">
      <label style="${BPLBL}">Solución</label>
      <div style="display:flex;gap:20px;margin-bottom:12px;flex-wrap:wrap">
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px"><input type="radio" name="bp-sol-tipo" value="alternativa" ${(ed.sol?.tipo||'alternativa')==='alternativa'?'checked':''} onchange="bpOnSolTipo(this.value)"> Alternativa correcta</label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px"><input type="radio" name="bp-sol-tipo" value="desarrollo" ${ed.sol?.tipo==='desarrollo'?'checked':''} onchange="bpOnSolTipo(this.value)"> Desarrollo (matemáticas)</label>
      </div>
      <div id="bp-sol-alt-row" style="${(ed.sol?.tipo||'alternativa')==='alternativa'?'display:flex':'display:none'};gap:18px;flex-wrap:wrap">
        ${altLetras.map((L,i)=>`<label style="cursor:pointer;display:flex;align-items:center;gap:5px"><input type="radio" name="bp-sol-alt" value="${i}" ${ed.sol?.alt===i?'checked':''}> ${L}</label>`).join('')}
      </div>
      <div id="bp-sol-dev-row" style="${ed.sol?.tipo==='desarrollo'?'':'display:none'}">
        <textarea id="bp-sol-dev" rows="4" style="${BPINP};resize:vertical" placeholder="Desarrollo paso a paso (LaTeX: $x+1$, $$\\frac{a}{b}$$)...">${gpEsc(ed.sol?.desarrollo||'')}</textarea>
        <label class="btn btn-outline" style="cursor:pointer;font-size:11px;padding:5px 12px;margin-top:6px;display:inline-block">
          📷 Imagen solución<input type="file" accept="image/*" style="display:none" onchange="bpUploadSolImg(this)">
        </label>
        ${ed.sol?.devImg?`<img src="${ed.sol.devImg}" style="max-width:240px;max-height:120px;object-fit:contain;border:1px solid var(--border);margin-top:6px;display:block">`:''}
      </div>
    </div>
  </div>

  <!-- TEXTO BASE: sub-preguntas -->
  <div id="bp-sec-textobase" style="${ed.tipo==='texto_base'?'':'display:none'}">
    <div id="bp-subitems-container">${bpHtmlSubitems()}</div>
    <button class="btn btn-outline" onclick="bpAddSubitem()" style="margin-bottom:16px">+ Agregar Sub-Pregunta</button>
  </div>

  <div style="display:flex;gap:10px;padding-top:4px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-gold" id="bp-btn-guardar" onclick="bpGuardar()">${ed.id?'ACTUALIZAR PREGUNTA':'GUARDAR PREGUNTA'}</button>
    <button class="btn btn-outline" onclick="bpPrevisualizar()">👁 Previsualizar</button>
    <button class="btn btn-outline" onclick="bpNueva();bpRenderUI()">Limpiar / Nueva</button>
    <span id="bp-save-status" style="font-size:12px;color:#8aaac8"></span>
  </div>
</div>

<!-- ── EXPLORAR / ENVIAR ── -->
<div id="bp-pane-explorar" style="${BP.tab==='explorar'?'':'display:none'}">
  <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end">
    <div style="flex:1;min-width:180px">
      <label style="${BPLBL}">Materia</label>
      <select id="bp-filt-mat" style="${BPINP}" onchange="bpFiltrar()">
        <option value="">-- Todas las materias --</option>
        ${BP.mats.map(m=>`<option value="${m.id}"${BP.fMat===m.id?'selected':''}>${gpEsc(m.nombre)}</option>`).join('')}
      </select>
    </div>
    <div style="flex:1;min-width:160px">
      <label style="${BPLBL}">Subtema</label>
      <input id="bp-filt-sub" list="bp-filt-dl" placeholder="Filtrar subtema..." style="${BPINP}" value="${gpEsc(BP.fSub)}" oninput="bpFiltrar()"/>
      <datalist id="bp-filt-dl">${(BP.fMat?BP.subtemas[BP.fMat]||[]:[...new Set(Object.values(BP.subtemas).flat())]).map(s=>`<option value="${gpEsc(s)}">`).join('')}</datalist>
    </div>
    <button class="btn btn-gold" id="bp-btn-enviar" onclick="bpMandadAPractica()" style="white-space:nowrap">Mandar a Práctica →</button>
  </div>
  <div style="margin-bottom:14px;position:relative">
    <label style="${BPLBL}">Buscar por texto del enunciado</label>
    <input id="bp-filt-txt" style="${BPINP};padding-right:36px" placeholder="Escribe parte del enunciado para buscar..." value="${gpEsc(BP.fTxt)}" oninput="bpFiltrarTxt(this.value)"/>
    <button id="bp-filt-txt-clear" onclick="bpFiltrarTxt('');this.closest('div').querySelector('input').value=''" style="position:absolute;right:8px;bottom:9px;background:none;border:none;color:#8aaac8;cursor:pointer;font-size:16px;line-height:1;display:${BP.fTxt?'block':'none'}" title="Limpiar">✕</button>
  </div>
  <div id="bp-lista-sel" style="font-size:12px;color:#8aaac8;margin-bottom:8px">0 seleccionadas</div>
  <div id="bp-lista"><div class="empty"><div class="ei"></div><div class="et">Selecciona una materia para ver preguntas</div></div></div>
</div>
`;
}

function bpHtmlSubitems(){
  return (BP.ed?.subitems||[]).map((si,i)=>`
<div style="background:var(--navy2);border:1px solid var(--border);padding:14px;margin-bottom:10px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <span style="font-weight:700;color:var(--gold);font-size:13px">Sub-pregunta ${i+1}</span>
    <button class="btn btn-red" style="padding:4px 10px;font-size:11px" onclick="bpDelSubitem(${i})">✕ Eliminar</button>
  </div>
  ${BP_FMT_BAR(`bp-si-texto-${i}`)}
  <textarea id="bp-si-texto-${i}" rows="3" style="${BPINP};resize:vertical;margin-bottom:10px" placeholder="Texto de la sub-pregunta (LaTeX: $...$)..." onpaste="bpOnPasteSub(event,${i})">${gpEsc(si.texto||'')}</textarea>
  ${['A','B','C','D','E'].map((L,j)=>`
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
    <span style="color:var(--gold);font-weight:700;min-width:22px">${L})</span>
    <input id="bp-si-alt-${i}-${j}" style="${BPINP}" placeholder="Alternativa ${L}..." value="${gpEsc((si.alts||[])[j]||'')}"/>
  </div>`).join('')}
  <div style="margin-top:12px">
    <span style="${BPLBL}">Respuesta correcta</span>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px">
      ${['A','B','C','D','E'].map((L,j)=>`<label style="cursor:pointer;display:flex;align-items:center;gap:5px"><input type="radio" name="bp-si-sol-${i}" value="${j}" ${(si.sol?.alt??-1)===j?'checked':''}> ${L}</label>`).join('')}
      <label style="cursor:pointer;display:flex;align-items:center;gap:5px"><input type="radio" name="bp-si-sol-${i}" value="-1" ${(si.sol?.alt??-1)<0?'checked':''}> Desarrollo</label>
    </div>
    <textarea id="bp-si-dev-${i}" rows="2" style="${BPINP};resize:vertical" placeholder="Desarrollo (solo si corresponde, acepta LaTeX)...">${gpEsc(si.sol?.desarrollo||'')}</textarea>
  </div>
</div>`).join('')||'<div style="color:#4a5a6a;font-size:13px;padding:10px 0">Agrega sub-preguntas usando el botón de abajo.</div>';
}

const BP_FMT_BTN=`display:inline-flex;align-items:center;justify-content:center;width:28px;height:24px;border:1px solid var(--border);background:transparent;color:var(--white);cursor:pointer;font-family:'Barlow',sans-serif;font-size:12px`;
const BP_FMT_BAR=(id)=>`<div style="display:flex;gap:4px;margin-bottom:6px">
  <button style="${BP_FMT_BTN};font-weight:700" title="Negrita (\\textbf{})" onmousedown="event.preventDefault();bpFormatSel('bold','${id}')"><b>B</b></button>
  <button style="${BP_FMT_BTN};font-style:italic" title="Cursiva (\\textit{})" onmousedown="event.preventDefault();bpFormatSel('italic','${id}')"><i>I</i></button>
  <button style="${BP_FMT_BTN};text-decoration:underline" title="Subrayado (\\underline{})" onmousedown="event.preventDefault();bpFormatSel('under','${id}')"><u>S</u></button>
</div>`;

function bpFormatSel(cmd,inputId){
  const ta=document.getElementById(inputId);
  if(!ta)return;
  const s=ta.selectionStart,e=ta.selectionEnd;
  const sel=ta.value.slice(s,e);
  if(!sel)return;
  const cmds={bold:`\\textbf{${sel}}`,italic:`\\textit{${sel}}`,under:`\\underline{${sel}}`};
  const wrapped=cmds[cmd];
  ta.value=ta.value.slice(0,s)+wrapped+ta.value.slice(e);
  ta.focus();
  ta.setSelectionRange(s+wrapped.length,s+wrapped.length);
}

function bpOnMateriaChange(val){
  BP.ed.materia_id=val;
  const dl=document.getElementById('bp-sub-dl');
  if(dl)dl.innerHTML=(BP.subtemas[val]||[]).map(s=>`<option value="${gpEsc(s)}">`).join('');
  const nivelRow=document.getElementById('bp-nivel-row');
  if(nivelRow)nivelRow.style.display=bpEsMatematica(val)?'':'none';
}

function bpOnTipoChange(val){
  bpLeerForm();
  BP.ed.tipo=val;
  document.getElementById('bp-sec-simple').style.display=val==='simple'?'':'none';
  document.getElementById('bp-sec-textobase').style.display=val==='texto_base'?'':'none';
  if(val==='texto_base'&&!BP.ed.subitems.length){
    const raw=prompt('¿Cuántas preguntas tiene este texto base?','4');
    const n=parseInt(raw);
    if(n>0&&n<=20){
      BP.ed.subitems=Array.from({length:n},()=>({
        texto:'',imagen_url:null,
        alts:['','','','',''],altImgs:[null,null,null,null,null],
        sol:{alt:-1,desarrollo:''}
      }));
      document.getElementById('bp-subitems-container').innerHTML=bpHtmlSubitems();
    }
  }
}

function bpOnSolTipo(val){
  BP.ed.sol.tipo=val;
  document.getElementById('bp-sol-alt-row').style.display=val==='alternativa'?'flex':'none';
  document.getElementById('bp-sol-dev-row').style.display=val==='desarrollo'?'':'none';
}

function bpLeerSubitems(){
  (BP.ed.subitems||[]).forEach((si,i)=>{
    si.texto=document.getElementById(`bp-si-texto-${i}`)?.value||'';
    for(let j=0;j<5;j++) si.alts[j]=document.getElementById(`bp-si-alt-${i}-${j}`)?.value||'';
    const v=document.querySelector(`input[name="bp-si-sol-${i}"]:checked`)?.value;
    si.sol.alt=v!==undefined?parseInt(v):-1;
    si.sol.desarrollo=document.getElementById(`bp-si-dev-${i}`)?.value||'';
  });
}

function bpLeerForm(){
  const ed=BP.ed;
  ed.materia_id=document.getElementById('bp-materia')?.value||ed.materia_id;
  ed.subtema=(document.getElementById('bp-subtema')?.value||'').trim();
  ed.tipo=document.getElementById('bp-tipo')?.value||ed.tipo;
  ed.fuente=(document.getElementById('bp-fuente')?.value||'').trim();
  const _nivelEl=document.getElementById('bp-nivel');
  if(_nivelEl)ed.nivel=_nivelEl.value||null;
  ed.enunciado_texto=document.getElementById('bp-enunciado')?.value||'';
  ed.enunciado_post=document.getElementById('bp-epost')?.value||'';
  if(ed.tipo==='simple'){
    for(let i=0;i<5;i++) ed.alts[i]=document.getElementById(`bp-alt-${i}`)?.value||'';
    const st=document.querySelector('input[name="bp-sol-tipo"]:checked')?.value||'alternativa';
    ed.sol.tipo=st;
    if(st==='alternativa'){
      const v=document.querySelector('input[name="bp-sol-alt"]:checked')?.value;
      ed.sol.alt=v!==undefined?parseInt(v):-1;
    }else{ed.sol.desarrollo=document.getElementById('bp-sol-dev')?.value||'';}
  }else{bpLeerSubitems();}
}

function bpAddSubitem(){
  bpLeerSubitems();
  BP.ed.subitems.push({texto:'',imagen_url:null,alts:['','','','',''],altImgs:[null,null,null,null,null],sol:{alt:-1,desarrollo:''}});
  document.getElementById('bp-subitems-container').innerHTML=bpHtmlSubitems();
}

function bpDelSubitem(i){
  bpLeerSubitems();
  BP.ed.subitems.splice(i,1);
  document.getElementById('bp-subitems-container').innerHTML=bpHtmlSubitems();
}

async function bpUploadImg(file,subfolder){
  const ext=file.name.split('.').pop().toLowerCase()||'jpg';
  const path=`${subfolder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const{error}=await sb.storage.from('banco-preguntas').upload(path,file,{contentType:file.type});
  if(error)throw error;
  return STORAGE+'banco-preguntas/'+path;
}

async function bpUploadEnunciado(input){
  const file=input.files[0];if(!file)return;
  const st=document.getElementById('bp-save-status');
  if(st)st.textContent='Subiendo imagen...';
  try{bpLeerForm();const url=await bpUploadImg(file,`enunciados/${BP.ed.materia_id||'general'}`);BP.ed.enunciado_imagen_url=url;bpRenderUI();}
  catch(e){await myAlert('Error al subir imagen: '+e.message);}
  if(st)st.textContent='';
}

async function bpUploadAlt(input,idx){
  const file=input.files[0];if(!file)return;
  const st=document.getElementById('bp-save-status');
  if(st)st.textContent='Subiendo imagen...';
  try{bpLeerForm();const url=await bpUploadImg(file,`alternativas/${BP.ed.materia_id||'general'}`);BP.ed.altImgs[idx]=url;bpRenderUI();}
  catch(e){await myAlert('Error al subir imagen: '+e.message);}
  if(st)st.textContent='';
}

async function bpUploadSolImg(input){
  const file=input.files[0];if(!file)return;
  const st=document.getElementById('bp-save-status');
  if(st)st.textContent='Subiendo imagen...';
  try{bpLeerForm();const url=await bpUploadImg(file,`soluciones/${BP.ed.materia_id||'general'}`);BP.ed.sol.devImg=url;bpRenderUI();}
  catch(e){await myAlert('Error al subir imagen: '+e.message);}
  if(st)st.textContent='';
}

function bpQuitarImgEnunciado(){BP.ed.enunciado_imagen_url=null;bpRenderUI();}

async function bpGuardar(){
  bpLeerForm();
  const ed=BP.ed;
  const st=document.getElementById('bp-save-status');
  const btn=document.getElementById('bp-btn-guardar');
  if(!ed.materia_id){await myAlert('Selecciona una materia.');return;}
  if(ed.tipo!=='texto_base'&&!ed.enunciado_texto.trim()&&!ed.enunciado_imagen_url){await myAlert('Escribe el enunciado o sube una imagen.');return;}
  if(ed.tipo==='texto_base'&&!ed.enunciado_texto.trim()&&!ed.enunciado_imagen_url){await myAlert('El campo "Texto de Lectura" es obligatorio para preguntas de Texto Base.\n\nPega la lectura completa en el campo resaltado con borde dorado antes de guardar.');return;}
  if(ed.tipo==='texto_base'&&!ed.subitems.length){await myAlert('Agrega al menos una sub-pregunta para tipo Texto Base.');return;}
  if(btn)btn.disabled=true;BP.saving=true;if(st)st.textContent='Guardando...';
  try{
    const{data:{user}}=await sb.auth.getUser();
    const pregData={materia_id:ed.materia_id,subtema:ed.subtema,tipo:ed.tipo,
      nivel:bpEsMatematica(ed.materia_id)?ed.nivel||null:null,
      fuente:ed.fuente||null,
      enunciado_texto:ed.enunciado_texto,enunciado_imagen_url:ed.enunciado_imagen_url,
      enunciado_post:ed.enunciado_post,creado_por:user?.id};
    let pregId=ed.id;
    if(pregId){
      const{error}=await sb.from('banco_preguntas').update(pregData).eq('id',pregId);if(error)throw error;
      await sb.from('banco_subitems').delete().eq('pregunta_id',pregId);
      await sb.from('banco_alternativas').delete().eq('pregunta_id',pregId);
      await sb.from('banco_soluciones').delete().eq('pregunta_id',pregId);
    }else{
      const{data,error}=await sb.from('banco_preguntas').insert(pregData).select('id').single();
      if(error)throw error;pregId=data.id;
    }
    if(ed.tipo==='simple'){
      const alts=ed.alts.map((txt,i)=>({pregunta_id:pregId,orden:i,texto:txt,imagen_url:ed.altImgs[i]})).filter(a=>a.texto.trim()||a.imagen_url);
      if(alts.length){const{error}=await sb.from('banco_alternativas').insert(alts);if(error)throw error;}
      const{error:sErr}=await sb.from('banco_soluciones').insert({
        pregunta_id:pregId,tipo:ed.sol.tipo,
        alternativa_correcta:ed.sol.tipo==='alternativa'?ed.sol.alt:null,
        desarrollo_texto:ed.sol.tipo==='desarrollo'?ed.sol.desarrollo:null,
        desarrollo_imagen_url:ed.sol.tipo==='desarrollo'?ed.sol.devImg:null
      });
      if(sErr)throw sErr;
    }else{
      for(let i=0;i<ed.subitems.length;i++){
        const si=ed.subitems[i];
        const{data:siD,error:siErr}=await sb.from('banco_subitems').insert({pregunta_id:pregId,orden:i,texto:si.texto,imagen_url:si.imagen_url||null}).select('id').single();
        if(siErr)throw siErr;
        const siId=siD.id;
        const siAlts=si.alts.map((txt,j)=>({subitem_id:siId,orden:j,texto:txt})).filter(a=>a.texto.trim());
        if(siAlts.length){const{error}=await sb.from('banco_alternativas').insert(siAlts);if(error)throw error;}
        const solTipo=si.sol.alt>=0?'alternativa':'desarrollo';
        const{error:solErr}=await sb.from('banco_soluciones').insert({subitem_id:siId,tipo:solTipo,
          alternativa_correcta:solTipo==='alternativa'?si.sol.alt:null,
          desarrollo_texto:solTipo==='desarrollo'?si.sol.desarrollo:null});
        if(solErr)throw solErr;
      }
    }
    if(ed.subtema&&!(BP.subtemas[ed.materia_id]||[]).includes(ed.subtema)){
      if(!BP.subtemas[ed.materia_id])BP.subtemas[ed.materia_id]=[];
      BP.subtemas[ed.materia_id].push(ed.subtema);
    }
    const _savedMat=ed.materia_id,_savedSub=ed.subtema;
    const _matNom=BP.mats.find(m=>m.id===_savedMat)?.nombre||'';
    const _subInfo=_savedSub?` · ${_savedSub}`:'';
    BP.lista=[];BP.listaConteo=[];BP.listaRand=[];
    bpNueva();BP.ed.materia_id=_savedMat;BP.ed.subtema=_savedSub;bpRenderUI();
    showToast(`✓ Pregunta guardada → ${_matNom}${_subInfo||' · sin subtema'}`);
  }catch(e){
    console.error(e);if(st)st.textContent='';
    await myAlert('Error al guardar: '+e.message);
  }
  BP.saving=false;if(btn)btn.disabled=false;
}

function bpHtmlPreviewContent(data,matNom){
  // data: {materia_id,subtema,tipo,enunciado_texto,enunciado_imagen_url,enunciado_post,alts[],altImgs[],sol,subitems[]}
  const LTRS=['A','B','C','D','E'];
  const _NCOL={facil:'#2ea84a',medio:'#c9a84c',dificil:'#e55'};
  const _nivelStr=data.nivel?` <span style="font-size:10px;border:1px solid ${_NCOL[data.nivel]||'#8aaac8'};color:${_NCOL[data.nivel]||'#8aaac8'};padding:1px 7px;margin-left:4px">${data.nivel.toUpperCase()}</span>`:'';
  const _fuenteStr=data.fuente?`<div style="font-size:10px;color:#6a9ac8;margin-top:3px">📚 ${gpEsc(data.fuente)}</div>`:'';
  let h=`<div style="font-size:11px;color:var(--gold);font-weight:700;letter-spacing:.06em;margin-bottom:2px">${gpEsc(matNom)}${data.subtema?' <span style="color:#8aaac8">·</span> '+gpEsc(data.subtema):''}${_nivelStr}</div>${_fuenteStr}<div style="margin-bottom:6px"></div>`;
  if(data.enunciado_texto)h+=`<div style="font-size:14px;line-height:1.7;margin-bottom:10px">${data.enunciado_texto}</div>`;
  if(data.enunciado_imagen_url)h+=`<img src="${data.enunciado_imagen_url}" style="max-width:100%;max-height:220px;object-fit:contain;border:1px solid var(--border);margin-bottom:8px;display:block">`;
  if(data.enunciado_post)h+=`<div style="font-size:13px;color:#c0d0e0;margin-bottom:10px">${data.enunciado_post}</div>`;
  if(data.tipo==='simple'){
    h+=`<div style="margin:10px 0">`;
    LTRS.forEach((L,i)=>{
      const txt=(data.alts||[])[i]||'';const img=(data.altImgs||[])[i]||null;
      if(!txt&&!img)return;
      const ok=data.sol?.tipo==='alternativa'&&data.sol.alt===i;
      h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;padding:5px 8px;${ok?'background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.5);':''}">`
        +`<span style="font-weight:700;color:${ok?'var(--gold)':'#8aaac8'};min-width:20px">${L})</span>`;
      if(txt)h+=`<span style="font-size:13px;flex:1">${txt}</span>`;
      if(img)h+=`<img src="${img}" style="height:35px;width:auto">`;
      if(ok)h+=`<span style="font-size:10px;color:var(--gold);font-weight:700;white-space:nowrap">✓ CORRECTA</span>`;
      h+=`</div>`;
    });
    h+=`</div>`;
    if(data.sol?.tipo==='desarrollo'&&(data.sol.desarrollo||'').trim()){
      h+=`<div style="background:rgba(201,168,76,.08);border-left:3px solid var(--gold);padding:10px 14px;margin-top:8px">`
        +`<div style="font-size:10px;color:var(--gold);font-weight:700;margin-bottom:5px">DESARROLLO</div>`
        +`<div style="font-size:13px;line-height:1.7">${data.sol.desarrollo}</div></div>`;
    }
    if(data.sol?.devImg)h+=`<img src="${data.sol.devImg}" style="max-width:100%;max-height:160px;object-fit:contain;border:1px solid var(--border);margin-top:8px;display:block">`;
  }else{
    (data.subitems||[]).forEach((si,i)=>{
      h+=`<div style="border:1px solid var(--border);padding:12px;margin-bottom:10px">`
        +`<div style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:7px">Sub-pregunta ${i+1}</div>`;
      if(si.texto)h+=`<div style="font-size:13px;line-height:1.7;margin-bottom:8px">${si.texto}</div>`;
      if(si.imagen_url||si.imgUrl)h+=`<img src="${si.imagen_url||si.imgUrl}" style="max-width:100%;max-height:160px;object-fit:contain;border:1px solid var(--border);margin-bottom:8px;display:block">`;
      const siAlts=si.alts||[];
      LTRS.forEach((L,j)=>{
        if(!siAlts[j]?.trim())return;
        const ok=si.sol?.alt===j;
        h+=`<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;padding:3px 6px;${ok?'background:rgba(201,168,76,.12);':''}">`
          +`<span style="font-weight:700;color:${ok?'var(--gold)':'#8aaac8'};min-width:20px">${L})</span>`
          +`<span style="font-size:13px;flex:1">${siAlts[j]}</span>`
          +(ok?`<span style="font-size:10px;color:var(--gold);font-weight:700">✓</span>`:'')
          +`</div>`;
      });
      if(si.sol?.desarrollo?.trim()){
        h+=`<div style="background:rgba(201,168,76,.08);border-left:3px solid var(--gold);padding:8px 12px;margin-top:8px">`
          +`<div style="font-size:10px;color:var(--gold);font-weight:700;margin-bottom:4px">DESARROLLO</div>`
          +`<div style="font-size:13px;line-height:1.7">${si.sol.desarrollo}</div></div>`;
      }
      h+=`</div>`;
    });
  }
  return h;
}

function bpPrevisualizar(){
  bpLeerForm();
  const ed=BP.ed;
  const matNom=BP.mats.find(m=>m.id===ed.materia_id)?.nombre||'Sin materia';
  const html=bpHtmlPreviewContent({
    materia_id:ed.materia_id,subtema:ed.subtema,tipo:ed.tipo,
    nivel:ed.nivel,fuente:ed.fuente,
    enunciado_texto:ed.enunciado_texto,enunciado_imagen_url:ed.enunciado_imagen_url,
    enunciado_post:ed.enunciado_post,
    alts:ed.alts,altImgs:ed.altImgs,sol:ed.sol,subitems:ed.subitems
  },matNom);
  const overlay=document.getElementById('bp-prev-overlay');
  const content=document.getElementById('bp-prev-content');
  content.innerHTML=html;
  overlay.style.display='flex';
  MathJax.startup.promise.then(()=>MathJax.typesetPromise([content]));
}

async function bpPrevLista(pregId){
  const overlay=document.getElementById('bp-prev-overlay');
  const content=document.getElementById('bp-prev-content');
  content.innerHTML='<div style="color:#8aaac8;font-size:13px">Cargando...</div>';
  overlay.style.display='flex';
  const{data:preg,error}=await sb.from('banco_preguntas').select(`
    id,materia_id,subtema,tipo,nivel,fuente,enunciado_texto,enunciado_imagen_url,enunciado_post,
    banco_subitems(id,orden,texto,imagen_url,banco_alternativas(id,orden,texto),banco_soluciones(id,tipo,alternativa_correcta,desarrollo_texto)),
    banco_alternativas(id,orden,texto,imagen_url),
    banco_soluciones(id,tipo,alternativa_correcta,desarrollo_texto,desarrollo_imagen_url)
  `).eq('id',pregId).single();
  if(error||!preg){content.innerHTML='<div style="color:#e55">Error al cargar: '+(error?.message||'no encontrada')+'</div>';return;}
  const matNom=BP.mats.find(m=>m.id===preg.materia_id)?.nombre||'';
  const alts=(preg.banco_alternativas||[]).slice().sort((a,b)=>a.orden-b.orden);
  const sol=preg.banco_soluciones?.[0]||null;
  const sis=(preg.banco_subitems||[]).slice().sort((a,b)=>a.orden-b.orden);
  const data={
    materia_id:preg.materia_id,subtema:preg.subtema||'',tipo:preg.tipo,
    nivel:preg.nivel||null,fuente:preg.fuente||'',
    enunciado_texto:preg.enunciado_texto||'',enunciado_imagen_url:preg.enunciado_imagen_url,
    enunciado_post:preg.enunciado_post||'',
    alts:Array.from({length:5},(_,i)=>alts[i]?.texto||''),
    altImgs:Array.from({length:5},(_,i)=>alts[i]?.imagen_url||null),
    sol:{tipo:sol?.tipo||'alternativa',alt:sol?.tipo==='alternativa'?(sol.alternativa_correcta??-1):-1,
      desarrollo:sol?.desarrollo_texto||'',devImg:sol?.desarrollo_imagen_url||null},
    subitems:sis.map(si=>{
      const sa=(si.banco_alternativas||[]).slice().sort((a,b)=>a.orden-b.orden);
      const ss=si.banco_soluciones?.[0]||null;
      return{texto:si.texto||'',imagen_url:si.imagen_url||null,
        alts:Array.from({length:5},(_,j)=>sa[j]?.texto||''),
        sol:{alt:ss?.tipo==='alternativa'?(ss.alternativa_correcta??-1):-1,desarrollo:ss?.desarrollo_texto||''}};
    })
  };
  content.innerHTML=bpHtmlPreviewContent(data,matNom);
  MathJax.startup.promise.then(()=>MathJax.typesetPromise([content]));
}

async function bpCargarLista(){
  const el=document.getElementById('bp-lista');if(!el)return;
  el.innerHTML='<div class="empty"><div class="et">Cargando...</div></div>';
  const matId=BP.fMat;const subFilt=BP.fSub.trim().toLowerCase();const txtFilt=BP.fTxt.trim();
  if(!matId&&!txtFilt){el.innerHTML='<div class="empty"><div class="ei"></div><div class="et">Selecciona una materia o escribe texto para buscar</div></div>';return;}
  // Pool completo para conteo Y selección aleatoria (2 páginas paralelas, supera límite 1000)
  const mkRand=()=>{
    let q=sb.from('banco_preguntas').select('id,subtema,tipo,banco_subitems(id)');
    if(matId)q=q.eq('materia_id',matId);
    if(subFilt)q=q.ilike('subtema','%'+subFilt+'%');
    if(txtFilt)q=q.ilike('enunciado_texto','%'+txtFilt+'%');
    return q;
  };
  // Query de display (solo 200 para la UI)
  const DISPLAY_LIMIT=200;
  let qDisplay=sb.from('banco_preguntas').select('id,materia_id,subtema,tipo,nivel,fuente,enunciado_texto,enunciado_imagen_url,materias(nombre),banco_subitems(id)').order('creado_en',{ascending:false}).limit(DISPLAY_LIMIT);
  if(matId)qDisplay=qDisplay.eq('materia_id',matId);
  if(subFilt)qDisplay=qDisplay.ilike('subtema','%'+subFilt+'%');
  if(txtFilt)qDisplay=qDisplay.ilike('enunciado_texto','%'+txtFilt+'%');
  const[{data:rd1,error:cErr},{data:rd2},{data:displayData,error:dErr}]=await Promise.all([
    mkRand().range(0,999),
    mkRand().range(1000,1999),
    qDisplay
  ]);
  if(cErr||dErr){el.innerHTML='<div class="empty"><div class="et">Error: '+((cErr||dErr).message)+'</div></div>';return;}
  BP.listaRand=[...(rd1||[]),...(rd2||[])];
  BP.listaConteo=BP.listaRand;
  BP.lista=displayData||[];
  bpRenderLista();
}

function bpFiltrar(){
  BP.fMat=document.getElementById('bp-filt-mat')?.value||'';
  BP.fSub=(document.getElementById('bp-filt-sub')?.value||'').trim().toLowerCase();
  const dl=document.getElementById('bp-filt-dl');
  if(dl&&BP.fMat)dl.innerHTML=(BP.subtemas[BP.fMat]||[]).map(s=>`<option value="${gpEsc(s)}">`).join('');
  if(BP.fMat||BP.fTxt)bpCargarLista();
}

function bpFiltrarTxt(val){
  clearTimeout(BP._txtTimer);
  BP.fTxt=val.trim();
  const clearBtn=document.getElementById('bp-filt-txt-clear');
  if(clearBtn)clearBtn.style.display=BP.fTxt?'block':'none';
  const lbl=document.getElementById('bp-lista-sel');
  if(lbl&&BP.fTxt)lbl.textContent='Buscando...';
  BP._txtTimer=setTimeout(()=>{
    if(BP.fMat||BP.fTxt)bpCargarLista();
    else{
      const el=document.getElementById('bp-lista');
      if(el)el.innerHTML='<div class="empty"><div class="ei"></div><div class="et">Selecciona una materia o escribe texto para buscar</div></div>';
      if(lbl)lbl.textContent='0 seleccionadas';
    }
  },420);
}

function bpRenderLista(){
  const el=document.getElementById('bp-lista');if(!el)return;
  const selEl=document.getElementById('bp-lista-sel');
  if(!BP.lista.length){
    el.innerHTML='<div class="empty"><div class="ei"></div><div class="et">Sin preguntas para este filtro</div></div>';
    if(selEl)selEl.textContent='0 seleccionadas';return;
  }
  // Resumen por subtema — usa listaConteo (total real de DB)
  const resMap={};
  const conteoBase=BP.listaConteo.length?BP.listaConteo:BP.lista;
  for(const p of conteoBase){const s=p.subtema||'(sin subtema)';resMap[s]=(resMap[s]||0)+1;}
  BP.randSubtemas=Object.entries(resMap).sort((a,b)=>b[1]-a[1]).map(([s])=>s);
  const totalReal=conteoBase.length;
  const matNomR=BP.mats.find(m=>m.id===BP.fMat)?.nombre||'TODAS LAS MATERIAS';
  const activeSub=BP.fSub.trim().toLowerCase();const activeTxt=BP.fTxt.trim();
  const resHtml=BP.randSubtemas.map(s=>{
    const c=resMap[s];
    const isActive=activeSub&&s.toLowerCase()===activeSub;
    return `<span onclick="bpFiltrarSubtema(${JSON.stringify(s)})" style="font-size:11px;background:${isActive?'var(--gold)':'var(--navy2)'};color:${isActive?'#0d1b2e':'var(--white)'};border:1px solid ${isActive?'var(--gold)':'var(--border)'};padding:3px 10px;white-space:nowrap;cursor:pointer;transition:all .15s" onmouseover="if(!${isActive})this.style.borderColor='var(--gold)'" onmouseout="if(!${isActive})this.style.borderColor='var(--border)'"><span style="font-weight:700;color:${isActive?'#0d1b2e':'var(--gold)'}">${c}</span> ${gpEsc(s)}</span>`;
  }).join('');
  const randRowsHtml=BP.randSubtemas.map((s,i)=>`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span style="font-size:12px;flex:1;color:var(--white)">${gpEsc(s)}</span>
      <span style="font-size:11px;color:#8aaac8">de ${resMap[s]}</span>
      <input id="bp-rand-inp-${i}" type="number" min="0" max="${resMap[s]}" value="0" style="width:60px;background:var(--navy);border:1px solid var(--border);color:var(--white);font-family:'Barlow',sans-serif;font-size:13px;padding:4px 8px;text-align:center">
    </div>`).join('');
  const simples=BP.lista.filter(p=>p.tipo!=='texto_base').length;
  const textos=BP.lista.filter(p=>p.tipo==='texto_base').length;
  const subpregs=BP.lista.filter(p=>p.tipo==='texto_base').reduce((s,p)=>s+(p.banco_subitems||[]).length,0);
  const totalEfectivo=simples+subpregs;
  const conteoStr=textos>0
    ? `${totalReal} registro${totalReal===1?'':'s'} · <span style="color:var(--white)">${simples} simple${simples===1?'':'s'}</span> + <span style="color:var(--gold)">${textos} texto${textos===1?'':'s'} base (${subpregs} sub-preg.)</span> = <span style="color:var(--white);font-weight:700">${totalEfectivo} preguntas efectivas</span>`
    : `${totalReal} pregunta${totalReal===1?'':'s'}`;
  const resumenBloque=`<div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.3);padding:10px 14px;margin-bottom:14px">
  <div style="font-size:10px;color:var(--gold);font-weight:700;letter-spacing:.06em;margin-bottom:7px">${gpEsc(matNomR).toUpperCase()} — ${conteoStr}${BP.lista.length<totalReal?` <span style="color:#8aaac8;font-weight:400">(mostrando ${BP.lista.length})</span>`:''}${activeSub?` <span style="color:#8aaac8;font-weight:400">· subtema: ${gpEsc(BP.fSub)}</span>`:''}${activeTxt?` <span style="color:#8aaac8;font-weight:400">· texto: "${gpEsc(activeTxt)}"</span>`:''}</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${resHtml}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <button class="btn btn-outline" style="font-size:11px;padding:4px 14px" onclick="bpSelTodos()">☑ Seleccionar todos</button>
    <button class="btn btn-outline" style="font-size:11px;padding:4px 14px" onclick="bpToggleRandPanel()">🎲 Selección aleatoria</button>
    ${BP.sel.size?`<button class="btn btn-outline" style="font-size:11px;padding:4px 14px;color:#e55;border-color:#e55" onclick="bpDeselTodos()">✕ Deseleccionar todos</button>`:''}
  </div>
  <div id="bp-rand-panel" style="display:none;margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
    <!-- Selección global por total -->
    <div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);padding:10px 12px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--gold);font-weight:700;letter-spacing:.06em;margin-bottom:8px">SELECCIÓN GLOBAL POR TOTAL</div>
      <div style="font-size:12px;color:#8aaac8;margin-bottom:8px">Los bloques de texto base se incluyen completos. El total puede no ser exacto.</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="font-size:12px;color:var(--white)">Quiero</label>
        <input id="bp-rand-total" type="number" min="1" max="200" value="20" style="width:64px;background:var(--navy);border:1px solid var(--border);color:var(--white);font-family:'Barlow',sans-serif;font-size:14px;padding:4px 8px;text-align:center">
        <label style="font-size:12px;color:var(--white)">preguntas al azar</label>
        <button class="btn btn-gold" style="font-size:12px;padding:5px 14px" onclick="bpAplicarAleatorioTotal()">Aplicar</button>
      </div>
    </div>
    <!-- Selección por subtema -->
    <div style="font-size:11px;color:var(--gold);font-weight:700;letter-spacing:.06em;margin-bottom:10px">O POR SUBTEMA</div>
    ${randRowsHtml}
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn btn-gold" style="font-size:12px;padding:5px 16px" onclick="bpAplicarAleatorio()">Aplicar por subtema</button>
      <button class="btn btn-outline" style="font-size:12px;padding:5px 16px" onclick="bpToggleRandPanel()">Cancelar</button>
    </div>
  </div>
</div>`;
  el.innerHTML=resumenBloque+`<div style="display:grid;gap:6px">
  ${BP.lista.map(p=>{
    const chk=BP.sel.has(p.id)?'checked':'';
    const preview=(p.enunciado_texto||'').slice(0,90)+(p.enunciado_texto?.length>90?'…':'');
    const peso=bpPeso(p);
    const sinTexto=p.tipo==='texto_base'&&!p.enunciado_texto?.trim()&&!p.enunciado_imagen_url;
    const tipoTag=p.tipo==='texto_base'?`<span style="font-size:10px;border:1px solid var(--gold);color:var(--gold);padding:1px 6px">TEXTO BASE · ${peso} preg.</span>${sinTexto?`<span style="font-size:10px;border:1px solid #e55;color:#e55;padding:1px 6px">⚠ sin texto</span>`:''}`:`<span style="font-size:10px;border:1px solid var(--border);color:#8aaac8;padding:1px 6px">SIMPLE</span>`;
    const subTag=p.subtema?`<span style="font-size:10px;background:var(--gold);color:#0d1b2e;padding:1px 7px;font-weight:700">${gpEsc(p.subtema)}</span>`:'';
    const _NC={facil:'#2ea84a',medio:'#c9a84c',dificil:'#e55'};
    const nivelTag=p.nivel?`<span style="font-size:10px;border:1px solid ${_NC[p.nivel]||'#8aaac8'};color:${_NC[p.nivel]||'#8aaac8'};padding:1px 6px">${p.nivel.toUpperCase()}</span>`:'';
    const fuenteTag=p.fuente?`<span style="font-size:10px;color:#6a9ac8">📚 ${gpEsc(p.fuente)}</span>`:'';
    return `<div style="display:flex;align-items:flex-start;gap:12px;background:var(--navy2);border:1px solid var(--border);padding:12px;transition:border-color .15s" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor=BP.sel.has('${p.id}')?'var(--gold)':'var(--border)'">
      <input type="checkbox" ${chk} style="margin-top:2px;width:16px;height:16px;flex-shrink:0;cursor:pointer" onclick="bpToggleSel('${p.id}',this.closest('div'))">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="bpToggleSel('${p.id}',this.closest('div'))">
        <div style="display:flex;gap:6px;margin-bottom:5px;flex-wrap:wrap">${subTag}${tipoTag}${nivelTag}</div>
        <div style="font-size:13px;color:var(--white);line-height:1.4">${gpEsc(preview)||'[imagen]'}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:3px">${p.enunciado_imagen_url?`<span style="font-size:10px;color:#6a9ac8">📷 con imagen</span>`:''}${fuenteTag}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;white-space:nowrap" onclick="event.stopPropagation();bpPrevLista('${p.id}')">👁 Ver</button>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;white-space:nowrap" onclick="event.stopPropagation();bpCargarParaEditar('${p.id}')">✏ Editar</button>
      </div>
    </div>`;
  }).join('')}</div>`;
  if(selEl)selEl.textContent=`${BP.sel.size} seleccionada${BP.sel.size===1?'':'s'}`;
}

function bpFiltrarSubtema(sub){
  const inp=document.getElementById('bp-filt-sub');
  if(inp)inp.value=sub;
  BP.fSub=sub.trim().toLowerCase();
  const dl=document.getElementById('bp-filt-dl');
  if(dl&&BP.fMat)dl.innerHTML=(BP.subtemas[BP.fMat]||[]).map(s=>`<option value="${gpEsc(s)}">`).join('');
  bpCargarLista();
}

function bpSelTodos(){
  BP.lista.forEach(p=>BP.sel.add(p.id));
  bpRenderLista();
}

function bpDeselTodos(){
  BP.sel.clear();
  bpRenderLista();
}

function bpToggleRandPanel(){
  const p=document.getElementById('bp-rand-panel');
  if(p)p.style.display=p.style.display==='none'?'block':'none';
}

function bpPeso(p){
  // peso = número de preguntas que aporta al examen
  if(p.tipo==='texto_base') return (p.banco_subitems||[]).length||1;
  return 1;
}

function bpAplicarAleatorioTotal(){
  const target=Math.max(1,parseInt(document.getElementById('bp-rand-total')?.value||'20')||20);
  BP.sel.clear();
  // Mezclar todas las preguntas disponibles (excluir texto_base sin texto ni imagen)
  const pool=(BP.listaRand.length?BP.listaRand:BP.lista).filter(p=>p.tipo!=='texto_base'||(p.banco_subitems||[]).length>0).slice().sort(()=>Math.random()-.5);
  let count=0;
  // Pasada 1: agregar lo que entra exacto o por debajo
  for(const p of pool){
    const w=bpPeso(p);
    if(count+w<=target){BP.sel.add(p.id);count+=w;}
    if(count===target)break;
  }
  // Pasada 2: si quedó corto, agregar el siguiente bloque que se pase lo menos posible
  if(count<target){
    const restantes=pool.filter(p=>!BP.sel.has(p.id));
    restantes.sort((a,b)=>bpPeso(a)-bpPeso(b)); // primero los más livianos
    for(const p of restantes){
      const w=bpPeso(p);
      if(count+w<=target+2){BP.sel.add(p.id);count+=w;break;} // tolerancia +2
    }
  }
  bpRenderLista();
  showToast(`✓ ${count} pregunta${count===1?'':'s'} seleccionadas (objetivo: ${target})`);
}

function bpAplicarAleatorio(){
  BP.sel.clear();
  (BP.randSubtemas||[]).forEach((sub,i)=>{
    const n=Math.max(0,parseInt(document.getElementById(`bp-rand-inp-${i}`)?.value||'0')||0);
    if(!n)return;
    const pool=(BP.listaRand.length?BP.listaRand:BP.lista).filter(p=>(p.subtema||'(sin subtema)')===sub&&(p.tipo!=='texto_base'||(p.banco_subitems||[]).length>0));
    pool.slice().sort(()=>Math.random()-.5).slice(0,n).forEach(p=>BP.sel.add(p.id));
  });
  bpRenderLista();
}

function bpToggleSel(id,el){
  if(BP.sel.has(id))BP.sel.delete(id);else BP.sel.add(id);
  const cb=el?.querySelector('input[type=checkbox]');
  if(cb)cb.checked=BP.sel.has(id);
  el.style.borderColor=BP.sel.has(id)?'var(--gold)':'var(--border)';
  const selEl=document.getElementById('bp-lista-sel');
  if(selEl)selEl.textContent=`${BP.sel.size} seleccionada${BP.sel.size===1?'':'s'}`;
}

async function bpCargarParaEditar(pregId){
  const{data:preg,error}=await sb.from('banco_preguntas').select(`
    id,materia_id,subtema,tipo,nivel,fuente,enunciado_texto,enunciado_imagen_url,enunciado_post,
    banco_subitems(id,orden,texto,imagen_url,banco_alternativas(id,orden,texto,imagen_url),banco_soluciones(id,tipo,alternativa_correcta,desarrollo_texto,desarrollo_imagen_url)),
    banco_alternativas(id,orden,texto,imagen_url),
    banco_soluciones(id,tipo,alternativa_correcta,desarrollo_texto,desarrollo_imagen_url)
  `).eq('id',pregId).single();
  if(error||!preg){await myAlert('Error al cargar pregunta: '+(error?.message||'no encontrada'));return;}

  const alts=(preg.banco_alternativas||[]).slice().sort((a,b)=>a.orden-b.orden);
  const sol=preg.banco_soluciones?.[0]||null;
  const sis=(preg.banco_subitems||[]).slice().sort((a,b)=>a.orden-b.orden);

  BP.ed={
    id:preg.id,
    materia_id:preg.materia_id||'',
    subtema:preg.subtema||'',
    tipo:preg.tipo||'simple',
    nivel:preg.nivel||null,
    fuente:preg.fuente||'',
    enunciado_texto:preg.enunciado_texto||'',
    enunciado_imagen_url:preg.enunciado_imagen_url||null,
    enunciado_post:preg.enunciado_post||'',
    alts:Array.from({length:5},(_,i)=>alts[i]?.texto||''),
    altImgs:Array.from({length:5},(_,i)=>alts[i]?.imagen_url||null),
    sol:{
      tipo:sol?.tipo||'alternativa',
      alt:sol?.tipo==='alternativa'?(sol.alternativa_correcta??-1):-1,
      desarrollo:sol?.desarrollo_texto||'',
      devImg:sol?.desarrollo_imagen_url||null
    },
    subitems:sis.map(si=>{
      const siAlts=(si.banco_alternativas||[]).slice().sort((a,b)=>a.orden-b.orden);
      const siSol=si.banco_soluciones?.[0]||null;
      return{
        id:si.id,texto:si.texto||'',imagen_url:si.imagen_url||null,
        alts:Array.from({length:5},(_,j)=>siAlts[j]?.texto||''),
        altImgs:Array.from({length:5},(_,j)=>siAlts[j]?.imagen_url||null),
        sol:{
          alt:siSol?.tipo==='alternativa'?(siSol.alternativa_correcta??-1):-1,
          desarrollo:siSol?.desarrollo_texto||''
        }
      };
    })
  };
  bpShowTab('gestionar');
  bpRenderUI();
  document.getElementById('bp-root')?.scrollIntoView({behavior:'smooth',block:'start'});
}

async function bpMandadAPractica(){
  if(!BP.sel.size){await myAlert('Selecciona al menos una pregunta.');return;}
  if(!allMaterias.length)await loadMaterias();
  if(!GP.init){
    // Cargar borrador existente para no pisarlo al agregar preguntas
    const _raw=localStorage.getItem('gp_draft');
    if(_raw){try{const _d=JSON.parse(_raw);Object.assign(GP.cfg,_d.cfg||{});GP.targetPages=_d.targetPages||0;GP.secciones=_d.secciones||[];}catch(e){GP.secciones=[];}}
    else{GP.cfg.fecha=new Date().toISOString().slice(0,10);GP.secciones=[];}
    GP.init=true;
  }
  const envBtn=document.getElementById('bp-btn-enviar');
  if(envBtn){envBtn.disabled=true;envBtn.textContent='Enviando...';}
  try{
    let total=0;
    for(const pregId of BP.sel){
      const{data:preg,error}=await sb.from('banco_preguntas').select(`
        id,tipo,enunciado_texto,enunciado_imagen_url,enunciado_post,materia_id,subtema,
        materias(nombre),
        banco_subitems(id,orden,texto,imagen_url,banco_alternativas(id,orden,texto,imagen_url),banco_soluciones(id,tipo,alternativa_correcta,desarrollo_texto,desarrollo_imagen_url)),
        banco_alternativas(id,orden,texto,imagen_url),
        banco_soluciones(id,tipo,alternativa_correcta,desarrollo_texto,desarrollo_imagen_url)
      `).eq('id',pregId).single();
      if(error||!preg)continue;
      if(preg.tipo==='texto_base')console.log('[BP→GP]',pregId,'enunciado_texto:',preg.enunciado_texto?.slice(0,80)||'(vacío — revisar en banco)');
      // Fallback: si texto_base vino sin enunciado_texto, intentar desde BP.lista (caché de la lista)
      if(preg.tipo==='texto_base'&&!preg.enunciado_texto?.trim()){
        const cached=BP.lista.find(p=>p.id===pregId);
        if(cached?.enunciado_texto?.trim())preg={...preg,enunciado_texto:cached.enunciado_texto};
        if(cached?.enunciado_imagen_url&&!preg.enunciado_imagen_url)preg={...preg,enunciado_imagen_url:cached.enunciado_imagen_url};
      }
      let sec=GP.secciones.find(s=>s.materia_id===preg.materia_id);
      if(!sec){
        sec={nombre:preg.materias?.nombre||'Sección',materia_id:preg.materia_id,items:[]};
        GP.secciones.push(sec);
      }
      sec.items.push(...bpToGpItems(preg));
      total++;
    }
    const n=BP.sel.size;
    BP.sel.clear();
    gpSaveDraft();
    const sbBtn=document.querySelector('.sb-link[onclick*="armar-practica"]');
    showPanel('armar-practica',sbBtn);
    await myAlert(`${total} pregunta${total===1?'':'s'} enviada${total===1?'':'s'} al generador de práctica.`);
  }catch(e){console.error(e);await myAlert('Error: '+e.message);}
  if(envBtn){envBtn.disabled=false;envBtn.textContent='Mandar a Práctica →';}
}

function bpToGpItems(preg){
  const items=[];
  if(preg.tipo==='texto_base'){
    let textoBase=preg.enunciado_texto||'';
    let textoImgUrl=preg.enunciado_imagen_url||null;
    let sis=(preg.banco_subitems||[]).slice().sort((a,b)=>a.orden-b.orden);
    // Fallback: si enunciado_texto está vacío pero enunciado_post tiene contenido,
    // el admin ingresó el texto de lectura en el campo post-imagen por error.
    if(!textoBase.trim()&&!textoImgUrl&&preg.enunciado_post?.trim()){
      textoBase=preg.enunciado_post;
      console.log('[BP→GP] Fallback enunciado_post→texto para',preg.id,textoBase.slice(0,60));
    }
    // Si enunciado_texto está vacío y el primer subitem no tiene alternativas,
    // ese subitem fue ingresado como texto de lectura por error de estructura.
    // Lo promovemos al bloque texto y lo excluimos de las preguntas numeradas.
    if(!textoBase.trim()&&!textoImgUrl&&sis.length){
      const primero=sis[0];
      const tieneAlts=(primero.banco_alternativas||[]).some(a=>a.texto?.trim());
      if(!tieneAlts){
        textoBase=primero.texto||'';
        textoImgUrl=primero.imagen_url||null;
        sis=sis.slice(1);
        console.log('[BP→GP] Texto de lectura promovido desde subitem 0:',textoBase.slice(0,60));
      }
    }
    items.push({tipo:'texto',texto:textoBase,etiqueta:preg.subtema||'Lectura',bpSubtema:preg.subtema||'',bpImgUrl:textoImgUrl});
    for(const si of sis){
      const alts=(si.banco_alternativas||[]).slice().sort((a,b)=>a.orden-b.orden);
      const sol=si.banco_soluciones?.[0]||null;
      items.push({
        tipo:'alternativas',e:si.texto||'',ePost:'',imgData:null,
        bpImgUrl:si.imagen_url||null,imgW:0,imgH:0,p:1,si:[],
        alts:Array.from({length:5},(_,i)=>alts[i]?.texto||''),
        altCorrecta:sol?.tipo==='alternativa'?(sol.alternativa_correcta??-1):-1,
        numAlts:alts.filter(a=>a.texto?.trim()).length||5,align:'left',
        bpId:preg.id,bpSiId:si.id,bpSubtema:preg.subtema||'',bpEsSubitem:true,
        bpSolTipo:sol?.tipo||null,bpSolAlt:sol?.alternativa_correcta??-1,
        bpSolDesarrollo:sol?.desarrollo_texto||''
      });
    }
  }else{
    const alts=(preg.banco_alternativas||[]).slice().sort((a,b)=>a.orden-b.orden);
    const sol=preg.banco_soluciones?.[0]||null;
    // Parsear formato [[pregunta],[respuesta]] usado en mate básica
    const _mb=(preg.enunciado_texto||'').match(/^\[\[(.+)\],\s*\[(.+)\]\]\s*$/);
    const _e=_mb?gpMbWrap(_mb[1]):(preg.enunciado_texto||'');
    const _solTipo=_mb?'desarrollo':(sol?.tipo||null);
    const _solDes=_mb?gpMbWrap(_mb[2]):(sol?.desarrollo_texto||'');
    items.push({
      tipo:alts.length?'alternativas':'pregunta',
      e:_e,ePost:preg.enunciado_post||'',imgData:null,
      bpImgUrl:preg.enunciado_imagen_url||null,imgW:0,imgH:0,p:1,si:[],
      alts:Array.from({length:5},(_,i)=>alts[i]?.texto||''),
      altCorrecta:sol?.tipo==='alternativa'?(sol.alternativa_correcta??-1):-1,
      numAlts:alts.filter(a=>a.texto?.trim()).length||5,align:'left',
      bpId:preg.id,bpSiId:null,bpSubtema:preg.subtema||'',
      bpSolTipo:_solTipo,bpSolAlt:sol?.alternativa_correcta??-1,
      bpSolDesarrollo:_solDes
    });
  }
  return items;
}

/* ── Solucionario PDF ── */
async function gpGenerarSolucionario(doc,solMap,titulo,fechaHoy){
  const LTRS=['A','B','C','D','E'];
  doc.addPage();
  // Header solucionario
  doc.setFillColor(20,38,60);doc.rect(0,0,gpPW,16,'F');
  doc.setFillColor(201,168,76);doc.rect(0,16,gpPW,.4,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(201,168,76);
  doc.text('SOLUCIONARIO',gpML,10.5);
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(180,200,220);
  doc.text(titulo,gpPW/2,10.5,{align:'center'});
  doc.text(fechaHoy,gpPW-gpMR,10.5,{align:'right'});
  doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(130,150,170);
  doc.text('Uso interno — no distribuir',gpPW/2,14,{align:'center'});
  let cy=22;
  // Agrupar por sección
  const bySection={},sectionOrder=[];
  for(const q of solMap){
    if(!bySection[q.secNombre]){bySection[q.secNombre]=[];sectionOrder.push(q.secNombre);}
    bySection[q.secNombre].push(q);
  }
  const PW2=gpPW-gpML-gpMR;
  for(const sec of sectionOrder){
    const qs=bySection[sec];
    if(cy+8>gpFOOT){doc.addPage();cy=10;}
    // Título de sección
    doc.setFillColor(215,222,230);doc.rect(gpML,cy,PW2,7,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(15,25,45);
    doc.text(sec.toUpperCase(),gpML+3,cy+5);cy+=10;
    // Alternativas en grilla de 10 por fila
    const altQs=qs.filter(q=>q.bpSolTipo==='alternativa');
    if(altQs.length){
      const PER=10,cw2=PW2/PER;
      for(let r=0;r<altQs.length;r+=PER){
        if(cy+7>gpFOOT){doc.addPage();cy=10;}
        const row=altQs.slice(r,r+PER);
        row.forEach((q,i)=>{
          const cx=gpML+i*cw2;
          doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(80,90,110);
          doc.text(String(q.num)+'.',cx,cy+4.5);
          doc.setFont('helvetica','bold');doc.setFontSize(8.5);
          doc.setTextColor(q.bpSolAlt>=0?20:150,q.bpSolAlt>=0?120:20,20);
          doc.text(q.bpSolAlt>=0?LTRS[q.bpSolAlt]:'?',cx+5.5,cy+4.5);
        });
        cy+=7;
      }
      cy+=3;
    }
    // Desarrollo (renderizado con MathJax si tiene _devImg)
    const devQs=qs.filter(q=>q.bpSolTipo==='desarrollo');
    for(const q of devQs){
      if(q._devImg){
        const{url,wMm,hMm}=q._devImg;
        const neededH=hMm+12;
        if(cy+neededH>gpFOOT){doc.addPage();cy=10;}
        doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(20,20,20);
        doc.text(`Preg. ${q.num}:`,gpML,cy+5);
        doc.addImage(url,'PNG',gpML+20,cy+1,wMm-20,hMm);
        cy+=neededH+2;
      }else{
        const devText=(q.bpSolDesarrollo||'').trim()||'(ver desarrollo)';
        const lines=doc.splitTextToSize(devText,PW2-22);
        const neededH=lines.length*4+10;
        if(cy+neededH>gpFOOT){doc.addPage();cy=10;}
        doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(20,20,20);
        doc.text(`Preg. ${q.num}:`,gpML,cy+4.5);
        doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(40,40,50);
        lines.forEach((ln,li)=>doc.text(ln,gpML+20,cy+4.5+li*4));
        cy+=neededH+2;
      }
    }
    cy+=4;
  }
}
// ── FIN ARMAR PRÁCTICA ────────────────────────────────────────────────────────

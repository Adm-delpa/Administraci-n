// Estudio Contable — Cloudflare Worker v3.0

const SW_CODE = `
const CACHE='estudio-v3';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>clients.claim())
));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||e.request.url.includes('/api'))return;
  e.respondWith(caches.open(CACHE).then(cache=>
    fetch(e.request).then(r=>{if(r&&r.status===200)cache.put(e.request,r.clone());return r;}).catch(()=>cache.match(e.request))
  ));
});
`;

const MANIFEST = JSON.stringify({
  name:'Estudio Contable AR',short_name:'Estudio AR',
  description:'Sistema de gestión contable — Rypstra Aldana S.',
  start_url:'/',scope:'/',display:'standalone',orientation:'portrait-primary',
  background_color:'#ffffff',theme_color:'#f97316',
  icons:[{src:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='80' fill='%23fff7ed'/%3E%3Ctext x='60' y='380' font-family='Georgia,serif' font-style='italic' font-size='330' fill='%233d3d3d'%3EAR%3C/text%3E%3C/svg%3E",sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]
},null,2);

const HTML=`<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Estudio Contable AR</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#f97316">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Estudio AR">
<style>
:root{
  --bg:#f5f3ef;--card:#fff;--ink:#1c1917;--muted:#78716c;--border:#e7e5e4;
  --orange:#f97316;--orange-dk:#ea580c;--orange-lt:#fff7ed;
  --green:#16a34a;--green-lt:#f0fdf4;
  --red:#dc2626;--red-lt:#fef2f2;
  --amber:#d97706;--amber-lt:#fffbeb;
  --blue:#2563eb;--blue-lt:#eff6ff;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
}
@media(prefers-color-scheme:dark){
  :root{
    --bg:#1c1917;--card:#292524;--ink:#fafaf9;--muted:#a8a29e;--border:#44403c;
    --orange-lt:#431407;--green-lt:#052e16;--red-lt:#450a0a;--amber-lt:#451a03;--blue-lt:#1e3a5f;
    --green:#4ade80;--red:#f87171;--amber:#fbbf24;--blue:#60a5fa;
  }
}
*,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.5}

/* ── HEADER ── */
#hdr{position:sticky;top:0;z-index:30;background:var(--card);border-bottom:1px solid var(--border);padding-top:env(safe-area-inset-top)}
.hdr-main{display:flex;align-items:center;gap:8px;padding:10px 14px}
.hdr-titulo{flex:1;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.hdr-estado{font-size:11px;color:var(--muted);font-family:var(--mono)}
.btn-icon{background:none;border:0;padding:6px;cursor:pointer;color:var(--muted);display:flex;align-items:center;border-radius:6px}
.btn-icon:hover{background:var(--border)}
.btn-home{background:none;border:0;padding:5px 7px;cursor:pointer;color:var(--orange);display:flex;align-items:center;border-radius:6px;flex-shrink:0}
.btn-home:hover{background:var(--orange-lt)}
.btn-back{display:none;align-items:center;gap:4px;background:none;border:0;padding:4px 8px;cursor:pointer;color:var(--orange);font-size:14px;font-weight:600;font-family:var(--sans);flex-shrink:0}

/* Sub-tabs */
#subtabs{display:none;border-top:1px solid var(--border);overflow-x:auto;scrollbar-width:none}
#subtabs::-webkit-scrollbar{display:none}
.subtab-inner{display:flex;min-width:max-content;padding:0 6px}
.subtabs button{background:none;border:0;border-bottom:2px solid transparent;padding:10px 14px;font-size:13px;font-family:var(--sans);color:var(--muted);cursor:pointer;font-weight:500;white-space:nowrap;transition:color .12s,border-color .12s}
.subtabs button[aria-selected=true]{color:var(--orange);border-bottom-color:var(--orange)}

/* ── MAIN ── */
#main{max-width:720px;margin:0 auto;padding:0 14px 40px}

/* ── PAGES ── */
.page{padding-top:16px}
.page[hidden]{display:none}

/* ── HOME ── */
#pg-inicio{display:flex;flex-direction:column;align-items:center;padding-top:0;min-height:calc(100vh - 57px - env(safe-area-inset-top))}
.inicio-logo{text-align:center;padding:40px 0 28px}
.logo-letras{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:80px;color:#3d3d3d;line-height:1;letter-spacing:-.02em}
@media(prefers-color-scheme:dark){.logo-letras{color:#d6d3d1}}
.logo-sub{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);margin-top:6px;font-weight:500}
.inicio-fecha{font-size:14px;color:var(--muted);margin-bottom:32px;font-family:var(--mono)}
.modulos-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:100%;max-width:380px;padding-bottom:32px}
.mod-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:22px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;cursor:pointer;transition:box-shadow .15s,transform .12s;text-align:center}
.mod-card:hover{box-shadow:0 4px 18px rgba(0,0,0,.1);transform:translateY(-1px)}
.mod-card:active{transform:scale(.97)}
.mod-ico{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--orange-lt)}
.mod-ico svg{width:24px;height:24px;color:var(--orange);stroke:var(--orange)}
.mod-ico.ico-blue{background:var(--blue-lt)}
.mod-ico.ico-blue svg{color:var(--blue);stroke:var(--blue)}
.mod-ico.ico-green{background:var(--green-lt)}
.mod-ico.ico-green svg{color:var(--green);stroke:var(--green)}
.mod-ico.ico-gray{background:var(--border)}
.mod-ico.ico-gray svg{color:var(--muted);stroke:var(--muted)}
.mod-nombre{font-size:13px;font-weight:600;color:var(--ink)}

/* ── BARRA BÚSQUEDA ── */
.barra{display:flex;gap:8px;align-items:center;margin-bottom:16px}
.barra input[type=search]{flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--ink);font-size:16px;font-family:var(--sans)}
.barra input[type=search]:focus{outline:2px solid var(--orange);outline-offset:1px}
.btn-add-inline{background:var(--orange);border:0;color:#fff;width:42px;height:42px;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* ── CLIENTES LIST ── */
.cli-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--border);cursor:pointer}
.cli-row:last-child{border-bottom:0}
.cli-avatar{width:40px;height:40px;border-radius:10px;background:var(--orange-lt);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--orange);flex-shrink:0;text-transform:uppercase}
.cli-info{flex:1;min-width:0}
.cli-nombre{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cli-meta{font-size:12px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cli-saldo{font-family:var(--mono);font-size:13px;font-weight:700;text-align:right;white-space:nowrap}
.s-debe{color:var(--red)}.s-favor{color:var(--green)}.s-ok{color:var(--muted)}

/* badges */
.badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border-radius:4px}
.b-ri{background:var(--blue-lt);color:var(--blue)}
.b-mono{background:var(--orange-lt);color:var(--orange)}
.b-ex{background:var(--border);color:var(--muted)}
.b-cf{background:var(--border);color:var(--muted)}
.b-imp{background:var(--green-lt);color:var(--green)}

/* ── DETALLE CARD ── */
#det-card{display:none;background:var(--card);border-bottom:1px solid var(--border);padding:14px}
.det-card-inner{display:flex;align-items:center;gap:14px;max-width:720px;margin:0 auto}
.det-avatar-lg{width:52px;height:52px;border-radius:14px;background:var(--orange-lt);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:var(--orange);flex-shrink:0;text-transform:uppercase}
.det-data{flex:1;min-width:0}
.det-nombre{font-size:18px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.det-cuit{font-size:12px;color:var(--muted);font-family:var(--mono);margin-top:2px}
.det-badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.det-honor{font-size:13px;color:var(--orange);font-weight:600;margin-top:5px;font-family:var(--mono)}

/* ── CARDS ── */
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px}
.card-titulo{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;margin-bottom:10px}

/* ── SALDO BANNER ── */
.saldo-banner{border-radius:12px;padding:16px;margin-bottom:14px;background:var(--card);border:1px solid var(--border)}
.saldo-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600}
.saldo-val{font-size:28px;font-weight:700;font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:-.03em;margin-top:4px}
.saldo-debe .saldo-val{color:var(--red)}.saldo-favor .saldo-val{color:var(--green)}.saldo-cero .saldo-val{color:var(--muted)}

/* ── ITEMS ── */
.item{display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid var(--border)}
.item:last-child{border-bottom:0}
.item-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:6px}
.dot-cargo{background:var(--red)}.dot-pago{background:var(--green)}
.item-body{flex:1;min-width:0}
.item-titulo{font-size:14px;font-weight:500}
.item-sub{font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:2px}
.item-num{font-family:var(--mono);font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.num-cargo{color:var(--red)}.num-pago{color:var(--green)}
.btn-del{background:none;border:0;color:var(--border);font-size:15px;cursor:pointer;padding:2px 4px;line-height:1;flex-shrink:0;border-radius:4px}
.btn-del:hover{color:var(--red);background:var(--red-lt)}

/* historial */
.nota-item{padding:12px 0;border-bottom:1px solid var(--border)}
.nota-item:last-child{border-bottom:0}
.nota-fecha{font-size:11px;color:var(--muted);font-family:var(--mono);margin-bottom:4px}
.nota-texto{font-size:14px;line-height:1.5;white-space:pre-wrap}
.nota-actions{display:flex;justify-content:flex-end;margin-top:6px}

/* vencimientos */
.vto-item{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border)}
.vto-item:last-child{border-bottom:0}
.vto-fecha-col{min-width:60px;text-align:center;flex-shrink:0}
.vto-dia{font-size:20px;font-weight:700;font-family:var(--mono);line-height:1}
.vto-mes{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.vto-info{flex:1;min-width:0}
.vto-concepto{font-size:14px;font-weight:500}
.vto-cli-nombre{font-size:11px;color:var(--muted);margin-top:1px}
.vto-estado{font-size:11px;margin-top:2px}
.vto-vencido{color:var(--red)}.vto-proximo{color:var(--amber)}.vto-ok{color:var(--muted)}
.btn-toggle-vto{background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--muted);cursor:pointer;white-space:nowrap;font-family:var(--sans)}
.btn-toggle-vto.cumplido{border-color:var(--green);color:var(--green)}
.vto-mes-hdr{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:600;margin:16px 0 4px;padding-bottom:4px;border-bottom:1px solid var(--border)}
.vto-nav{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.vto-periodo{flex:1;text-align:center;font-size:17px;font-weight:700}
.btn-periodo{background:none;border:1px solid var(--border);border-radius:8px;width:36px;height:36px;cursor:pointer;color:var(--ink);font-size:18px;display:flex;align-items:center;justify-content:center}
.btn-gen-vtos{background:none;border:1px solid var(--orange);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--orange);cursor:pointer;font-family:var(--sans);font-weight:600;margin-bottom:12px}

/* presupuestos */
.pres-item{padding:12px 0;border-bottom:1px solid var(--border)}
.pres-item:last-child{border-bottom:0}
.pres-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.pres-desc{font-size:14px;font-weight:600;flex:1}
.pres-total{font-family:var(--mono);font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.pres-items-preview{font-size:12px;color:var(--muted);margin-top:3px}
.pres-bot{display:flex;align-items:center;justify-content:space-between;margin-top:7px;gap:6px}
.pres-fecha{font-size:11px;color:var(--muted);font-family:var(--mono)}
.pres-acciones{display:flex;gap:6px;align-items:center}
.btn-estado{font-size:11px;padding:3px 9px;border-radius:5px;font-weight:600;cursor:pointer;border:0;font-family:var(--sans)}
.est-pendiente{background:var(--amber-lt);color:var(--amber)}
.est-aprobado{background:var(--green-lt);color:var(--green)}
.est-rechazado{background:var(--red-lt);color:var(--red)}
.btn-pdf{background:none;border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--muted);cursor:pointer;font-family:var(--sans)}
.btn-pdf:hover{border-color:var(--orange);color:var(--orange)}

/* presupuesto items form */
.pres-linea{display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:var(--bg);border-radius:8px}
.pres-linea-desc{flex:1;min-width:0;padding:7px 8px;font-size:14px;font-family:var(--sans);border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink)}
.pres-linea-num{width:64px;padding:7px 6px;font-size:14px;font-family:var(--mono);border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);text-align:right}
.pres-linea-desc:focus,.pres-linea-num:focus{outline:2px solid var(--orange);outline-offset:1px}
.pres-total-row{display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--border);margin-top:4px}
.pres-total-lbl{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600}
.pres-total-val{font-family:var(--mono);font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--orange)}

/* ── MONOTRIBUTO ── */
.mono-nav{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.mono-periodo{flex:1;text-align:center;font-size:17px;font-weight:700}
.mono-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px}
.mono-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.mono-nombre{flex:1;min-width:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mono-row{display:flex;align-items:center;gap:10px}
.mono-lbl{flex:1;font-size:13px;color:var(--muted)}
.switch{position:relative;width:44px;height:26px;flex-shrink:0;display:inline-block}
.switch input{opacity:0;width:0;height:0;position:absolute}
.sw-track{position:absolute;inset:0;background:var(--border);border-radius:13px;cursor:pointer;transition:background .2s}
.switch input:checked+.sw-track{background:var(--green)}
.sw-thumb{position:absolute;top:3px;left:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:left .2s;pointer-events:none}
.switch input:checked~.sw-thumb{left:21px}

/* ── FAB ── */
#fab{position:fixed;bottom:calc(20px + env(safe-area-inset-bottom));right:18px;z-index:25;background:var(--orange);border:0;color:#fff;width:52px;height:52px;border-radius:16px;cursor:pointer;display:none;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(249,115,22,.4)}

/* ── MODAL (CENTERED) ── */
#modal{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:16px}
#modal.open{display:flex}
.modal-card{background:var(--card);border-radius:16px;width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column}
.modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 12px;border-bottom:1px solid var(--border);flex-shrink:0}
.modal-titulo{font-size:16px;font-weight:700}
.btn-modal-x{background:none;border:0;color:var(--muted);font-size:20px;cursor:pointer;padding:0;line-height:1;border-radius:4px}
.modal-body{overflow-y:auto;padding:16px;flex:1}

/* ── FORMS ── */
.campo{margin-top:14px}
.campo:first-child{margin-top:0}
.campo label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:5px;font-weight:600}
.campo input,.campo select,.campo textarea{width:100%;padding:11px 10px;font-size:16px;font-family:var(--sans);border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--ink)}
.campo input:focus,.campo select:focus,.campo textarea:focus{outline:2px solid var(--orange);outline-offset:1px}
.campo input[type=number]{font-family:var(--mono);font-variant-numeric:tabular-nums}
.campo textarea{resize:vertical}
.fila{display:flex;gap:9px}
.fila>.campo{flex:1;min-width:0;margin-top:0}
.seg{display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.seg button{flex:1;padding:10px;background:none;border:0;border-right:1px solid var(--border);font-family:var(--sans);font-size:14px;color:var(--muted);cursor:pointer;font-weight:500;transition:background .12s,color .12s}
.seg button:last-child{border-right:0}
.seg button[aria-pressed=true]{background:var(--orange);color:#fff}
.chk-grupo{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.chk-chip{display:flex;align-items:center;gap:5px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;background:var(--bg);color:var(--ink)}
.chk-chip input{width:14px;height:14px;accent-color:var(--orange);cursor:pointer}
.btn-ok{width:100%;padding:13px;border:0;border-radius:8px;background:var(--orange);color:#fff;font-size:15px;font-family:var(--sans);font-weight:700;cursor:pointer;margin-top:18px}
.btn-ok:hover{background:var(--orange-dk)}
.btn-linea{width:100%;padding:11px;border:1px solid var(--border);border-radius:8px;background:none;color:var(--ink);font-size:14px;font-family:var(--sans);cursor:pointer;margin-top:8px}
.btn-danger{width:100%;padding:11px;border:1px solid var(--red);border-radius:8px;background:none;color:var(--red);font-size:14px;font-family:var(--sans);cursor:pointer;margin-top:8px}
.pista{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4}
.seccion-titulo{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:600;margin:20px 0 8px}
.seccion-titulo:first-child{margin-top:0}
.btn-add-linea{background:none;border:1px dashed var(--border);border-radius:8px;padding:8px;width:100%;font-size:13px;color:var(--muted);cursor:pointer;font-family:var(--sans);margin-top:4px}
.btn-add-linea:hover{border-color:var(--orange);color:var(--orange)}

/* ── AJUSTES ── */
.ajuste-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px}

/* ── EMPTY ── */
.vacio{padding:32px 0;text-align:center;font-size:14px;color:var(--muted);line-height:1.6}
.vacio-ico{font-size:32px;margin-bottom:10px}

@media(prefers-reduced-motion:no-preference){
  .page{animation:sube .18s ease-out}
  @keyframes sube{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
}
</style>

<div id="hdr">
  <div class="hdr-main">
    <button class="btn-home" id="btn-home" hidden>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5L9 2l6 5.5V16a1 1 0 01-1 1H4a1 1 0 01-1-1V7.5z"/><rect x="6.5" y="9" width="5" height="8" rx=".5"/></svg>
    </button>
    <button class="btn-back" id="btn-back">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="10,3 5,8 10,13"/></svg>
      Clientes
    </button>
    <div class="hdr-titulo" id="hdr-titulo">Estudio Contable</div>
    <div class="hdr-estado" id="hdr-estado"></div>
    <button class="btn-icon" id="btn-edit-cli" hidden title="Editar cliente">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5a1.41 1.41 0 012 2L5 13H2v-3L11.5 2.5z"/></svg>
    </button>
  </div>
  <div id="subtabs">
    <div class="subtab-inner">
      <button data-sub="cc" aria-selected="true">Cuenta corriente</button>
      <button data-sub="historial" aria-selected="false">Historial</button>
      <button data-sub="vtos" aria-selected="false">Vencimientos</button>
      <button data-sub="pres" aria-selected="false">Presupuestos</button>
    </div>
  </div>
</div>

<div id="det-card">
  <div class="det-card-inner">
    <div class="det-avatar-lg" id="det-avatar"></div>
    <div class="det-data">
      <div class="det-nombre" id="det-nombre"></div>
      <div class="det-cuit" id="det-cuit"></div>
      <div class="det-badges" id="det-badges"></div>
      <div class="det-honor" id="det-honor"></div>
    </div>
  </div>
</div>

<div id="main">

  <div id="pg-inicio" class="page">
    <div class="inicio-logo">
      <div class="logo-letras">AR</div>
      <div class="logo-sub">Estudio Contable</div>
    </div>
    <div class="inicio-fecha" id="inicio-fecha"></div>
    <div class="modulos-grid">
      <div class="mod-card" data-mod="clientes">
        <div class="mod-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 20c0-4 3.1-7 7-7s7 3 7 7"/><circle cx="18.5" cy="8.5" r="3"/><path d="M22 20c0-2.8-1.8-5-3.5-5.5"/></svg></div>
        <div class="mod-nombre">Clientes</div>
      </div>
      <div class="mod-card" data-mod="mono">
        <div class="mod-ico ico-blue"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><polyline points="9,12 11,14 15,10"/></svg></div>
        <div class="mod-nombre">Monotributo</div>
      </div>
      <div class="mod-card" data-mod="vtos">
        <div class="mod-ico ico-green"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/><circle cx="8" cy="15" r="1.2" fill="currentColor"/><circle cx="12" cy="15" r="1.2" fill="currentColor"/><circle cx="16" cy="15" r="1.2" fill="currentColor"/></svg></div>
        <div class="mod-nombre">Vencimientos</div>
      </div>
      <div class="mod-card" data-mod="ajustes">
        <div class="mod-ico ico-gray"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></div>
        <div class="mod-nombre">Ajustes</div>
      </div>
    </div>
  </div>

  <div id="pg-clientes" class="page" hidden>
    <div class="barra">
      <input type="search" id="buscar" placeholder="Buscar por nombre o CUIT...">
      <button class="btn-add-inline" id="btn-nuevo" title="Nuevo cliente">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="9" y1="2" x2="9" y2="16"/><line x1="2" y1="9" x2="16" y2="9"/></svg>
      </button>
    </div>
    <div id="lista-clientes"></div>
  </div>

  <div id="pg-detalle" class="page" hidden>
    <div id="sub-cc">
      <div class="saldo-banner" id="cc-banner">
        <div class="saldo-lbl" id="cc-lbl">Saldo de cuenta</div>
        <div class="saldo-val" id="cc-val">$ 0</div>
      </div>
      <div id="cc-lista"></div>
    </div>
    <div id="sub-historial" hidden><div id="hist-lista"></div></div>
    <div id="sub-vtos" hidden>
      <button class="btn-gen-vtos" id="btn-gen-vtos">&#128197; Generar vencimientos AFIP</button>
      <div id="vtos-lista"></div>
    </div>
    <div id="sub-pres" hidden><div id="pres-lista"></div></div>
  </div>

  <div id="pg-mono" class="page" hidden>
    <div class="mono-nav">
      <button class="btn-periodo" id="mono-prev">&#8249;</button>
      <span class="mono-periodo" id="mono-label"></span>
      <button class="btn-periodo" id="mono-next">&#8250;</button>
    </div>
    <div id="lista-mono"></div>
  </div>

  <div id="pg-vtos" class="page" hidden>
    <div class="vto-nav">
      <button class="btn-periodo" id="vtos-prev">&#8249;</button>
      <span class="vto-periodo" id="vtos-label"></span>
      <button class="btn-periodo" id="vtos-next">&#8250;</button>
    </div>
    <div id="vtos-global-lista"></div>
  </div>

  <div id="pg-ajustes" class="page" hidden>
    <div class="seccion-titulo">Datos</div>
    <div class="ajuste-card">
      <div class="pista" style="margin:0 0 12px">Exportá todos tus datos como archivo de respaldo, o importá una copia anterior.</div>
      <button class="btn-ok" id="btn-export" style="margin-top:0">Exportar copia de seguridad</button>
      <button class="btn-linea" id="btn-import" style="margin-top:9px">Importar copia</button>
      <input type="file" id="arch-import" accept=".json" hidden>
    </div>
    <div class="seccion-titulo">Acerca de</div>
    <div class="ajuste-card">
      <div class="pista" style="margin:0">Estudio Contable AR v3.0 &mdash; Rypstra Aldana S., Contadora P&uacute;blica &mdash; datos en Cloudflare KV.</div>
    </div>
  </div>

</div>

<button id="fab">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
</button>

<div id="modal">
  <div class="modal-card">
    <div class="modal-hdr">
      <span class="modal-titulo" id="modal-titulo"></span>
      <button class="btn-modal-x" id="modal-x">&#10005;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>

<script>
(function(){
"use strict";

var BASE = '__SYNC_BASE__';
var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var DIAS_SEM = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var CATS_FISCAL = ['Responsable Inscripto','Monotributo','Exento','Consumidor Final'];
var CATS_MONO   = ['A','B','C','D','E','F','G','H','I','J','K'];
var IMPUESTOS   = ['IVA','Ganancias','IIBB','Monotributo','Bienes Personales','Sueldos','Otro'];
var ESTADOS_PRES= ['pendiente','aprobado','rechazado'];

// AFIP vencimientos por impuesto: dias[grupo] donde grupo = floor(ultimoDigitoCUIT/2)
var AFIP_CAL = {
  'IVA':           { dias:[12,13,14,15,16], meses:[0,1,2,3,4,5,6,7,8,9,10,11] },
  'Ganancias':     { dias:[14,15,16,17,18], meses:[0,1,2,3,4,5,6,7,8,9,10,11] },
  'IIBB':          { dias:[15,16,17,18,19], meses:[0,1,2,3,4,5,6,7,8,9,10,11] },
  'Monotributo':   { dias:[20,21,22,23,24], meses:[0,1,2,3,4,5,6,7,8,9,10,11] },
  'Bienes Personales':{ dias:[15,16,17,18,19], meses:[5] },
  'Sueldos':       { dias:[10,11,12,13,14], meses:[0,1,2,3,4,5,6,7,8,9,10,11] }
};

// Estado
var db = { clientes:[], cc:[], historial:[], vtos:[], presupuestos:[], mono:[] };
var pag = 'inicio';
var sub = 'cc';
var cliId = null;
var monoMes = mesActual();
var vtosMes = mesActual();

function mesActual(){ var d=new Date(); return {y:d.getFullYear(),m:d.getMonth()}; }

// Utilidades
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cap(s){ return s?s[0].toUpperCase()+s.slice(1):''; }
function hoyISO(){ return new Date().toISOString().split('T')[0]; }
function pad(n){ return String(n).padStart(2,'0'); }
function fmtARS(n){ return '$ '+Math.round(Math.abs(Number(n)||0)).toLocaleString('es-AR'); }
function fmtMon(n,mon){ return mon==='USD'?'U$D '+Math.round(Math.abs(Number(n)||0)).toLocaleString('es-AR'):fmtARS(n); }
function periodoKey(y,m){ return y+'-'+pad(m+1); }
function periodoStr(y,m){ return MESES[m]+' '+y; }

function fmtFecha(iso){
  if(!iso)return '';
  var p=iso.split('-');
  if(p.length<3)return iso;
  return p[2]+' '+MESES_CORTO[parseInt(p[1],10)-1]+'. '+p[0];
}
function diasHasta(iso){
  var hoy=new Date(); hoy.setHours(0,0,0,0);
  var d=new Date(iso+'T00:00:00');
  return Math.round((d-hoy)/86400000);
}

function fechaHoy(){
  var d=new Date();
  return DIAS_SEM[d.getDay()]+', '+d.getDate()+' de '+MESES[d.getMonth()]+' '+d.getFullYear();
}

// API
function setEstado(txt){ var el=document.getElementById('hdr-estado'); if(el)el.textContent=txt; }
function apiGet(k){ return fetch(BASE+'/api/'+k).then(function(r){return r.json();}); }
function apiPut(k,data){
  return fetch(BASE+'/api/'+k,{method:'PUT',body:JSON.stringify(data),headers:{'content-type':'application/json'}});
}
function guardar(k){ return apiPut(k,db[k]).catch(function(e){console.error('guardar',k,e);}); }

function cargar(){
  setEstado('Cargando...');
  return Promise.all([
    apiGet('clientes'),apiGet('cc'),apiGet('historial'),
    apiGet('vtos'),apiGet('presupuestos'),apiGet('mono')
  ]).then(function(res){
    db.clientes    =res[0]||[];
    db.cc          =res[1]||[];
    db.historial   =res[2]||[];
    db.vtos        =res[3]||[];
    db.presupuestos=res[4]||[];
    db.mono        =res[5]||[];
    setEstado('');
    renderTodo();
  }).catch(function(){setEstado('Sin conexión');});
}

// ── NAVEGACIÓN ────────────────────────────────────────────────────────────────
var PAGES = ['inicio','clientes','detalle','mono','vtos','ajustes'];

function irA(s){
  pag = s;
  PAGES.forEach(function(p){
    var el=document.getElementById('pg-'+p);
    if(el) el.hidden=(p!==s);
  });

  var esInicio  = s==='inicio';
  var esDetalle = s==='detalle';

  // Header home button
  var btnHome = document.getElementById('btn-home');
  btnHome.hidden = esInicio || esDetalle;

  // Back button (solo en detalle)
  var btnBack = document.getElementById('btn-back');
  btnBack.style.display = esDetalle?'flex':'none';

  // Edit button (solo en detalle)
  document.getElementById('btn-edit-cli').hidden = !esDetalle;

  // Sub-tabs
  document.getElementById('subtabs').style.display = esDetalle?'block':'none';

  // Client detail card
  document.getElementById('det-card').style.display = esDetalle?'block':'none';

  // FAB
  document.getElementById('fab').style.display = esDetalle?'flex':'none';

  // Título
  var titulo = document.getElementById('hdr-titulo');
  if(!esDetalle){
    titulo.style.display = 'block';
    titulo.textContent =
      esInicio?'Estudio Contable':
      s==='clientes'?'Clientes':
      s==='mono'?'Monotributo':
      s==='vtos'?'Vencimientos':'Ajustes';
  } else {
    titulo.style.display = 'none';
  }

  // hdr-estado visible solo en no-detalle
  document.getElementById('hdr-estado').style.display = esDetalle?'none':'block';

  // Fecha en inicio
  var ifecha=document.getElementById('inicio-fecha');
  if(ifecha) ifecha.textContent=fechaHoy();

  // Scroll
  var m=document.getElementById('main');
  if(m)m.scrollTop=0;
}

document.getElementById('btn-home').addEventListener('click',function(){ irA('inicio'); });
document.getElementById('btn-back').addEventListener('click',function(){ cliId=null; irA('clientes'); });
document.getElementById('btn-edit-cli').addEventListener('click',function(){
  if(!cliId)return;
  var c=db.clientes.find(function(x){return x.id===cliId;});
  if(c)abrirFormCliente(c);
});

document.querySelectorAll('.mod-card').forEach(function(card){
  card.addEventListener('click',function(){ irA(card.dataset.mod); });
});

// ── CLIENTES ────────────────────────────────────────────────────────────────
function saldoCli(id){
  return db.cc.filter(function(m){return m.cliente_id===id;})
    .reduce(function(a,m){return a+(m.tipo==='cargo'?m.importe:-m.importe);},0);
}

function renderClientes(){
  var q=(document.getElementById('buscar').value||'').toLowerCase().trim();
  var lista=db.clientes.filter(function(c){
    if(c.activo===false)return false;
    if(!q)return true;
    return c.nombre.toLowerCase().includes(q)||(c.cuit||'').replace(/-/g,'').includes(q.replace(/-/g,''));
  }).sort(function(a,b){return a.nombre.localeCompare(b.nombre,'es');});

  var cont=document.getElementById('lista-clientes');
  if(!lista.length){
    cont.innerHTML='<div class="vacio"><div class="vacio-ico">&#128101;</div>'+(q?'Sin resultados para "'+esc(q)+'"':'No hay clientes todavía.<br>Tocá + para agregar uno.')+'</div>';
    return;
  }

  cont.innerHTML=lista.map(function(c){
    var saldo=saldoCli(c.id);
    var scls=saldo>0.5?'s-debe':saldo<-0.5?'s-favor':'s-ok';
    var stxt=saldo>0.5?'Debe '+fmtARS(saldo):saldo<-0.5?'A favor '+fmtARS(-saldo):'Al día';
    var inic=c.nombre.split(' ').slice(0,2).map(function(p){return p[0]||'';}).join('');
    var bcls=c.cat_fiscal==='Responsable Inscripto'?'b-ri':c.cat_fiscal==='Monotributo'?'b-mono':c.cat_fiscal==='Exento'?'b-ex':'b-cf';
    var bLabel=c.cat_fiscal==='Responsable Inscripto'?'R.I.':c.cat_fiscal==='Monotributo'?'Mono'+(c.cat_mono?' '+c.cat_mono:''):c.cat_fiscal==='Exento'?'Exento':'Cons.F.';
    return (
      '<div class="cli-row" data-id="'+c.id+'">'+
        '<div class="cli-avatar">'+esc(inic)+'</div>'+
        '<div class="cli-info">'+
          '<div class="cli-nombre">'+esc(c.nombre)+'</div>'+
          '<div class="cli-meta">'+
            (c.cuit?'<span>'+esc(c.cuit)+'</span>':'')+
            '<span class="badge '+bcls+'">'+esc(bLabel)+'</span>'+
            (c.honor_importe?'<span>'+fmtMon(c.honor_importe,c.honor_moneda)+'/mes</span>':'')+
          '</div>'+
        '</div>'+
        '<div class="cli-saldo '+scls+'">'+stxt+'</div>'+
      '</div>'
    );
  }).join('');

  cont.querySelectorAll('.cli-row').forEach(function(el){
    el.addEventListener('click',function(){abrirCliente(el.dataset.id);});
  });
}

document.getElementById('buscar').addEventListener('input',renderClientes);
document.getElementById('btn-nuevo').addEventListener('click',function(){abrirFormCliente(null);});

// ── FORM CLIENTE ─────────────────────────────────────────────────────────────
function abrirFormCliente(c){
  var esNuevo=!c;
  var imps=c&&c.impuestos?c.impuestos:[];
  var opsCat=CATS_FISCAL.map(function(k){return '<option value="'+k+'"'+(c&&c.cat_fiscal===k?' selected':'')+'>'+k+'</option>';}).join('');
  var opsMono=CATS_MONO.map(function(k){return '<option value="'+k+'"'+(c&&c.cat_mono===k?' selected':'')+'>Categoría '+k+'</option>';}).join('');
  var chksImps=IMPUESTOS.map(function(imp){
    return '<label class="chk-chip"><input type="checkbox" name="imp" value="'+imp+'"'+(imps.indexOf(imp)>=0?' checked':'')+'>'+esc(imp)+'</label>';
  }).join('');

  var html=(
    '<div class="campo"><label>Nombre / Razón social</label>'+
    '<input type="text" id="f-nombre" placeholder="Ej: García Juan Carlos" value="'+esc(c?c.nombre:'')+'"></div>'+
    '<div class="fila" style="margin-top:14px">'+
      '<div class="campo"><label>CUIT</label>'+
      '<input type="text" id="f-cuit" placeholder="20-12345678-9" value="'+esc(c?c.cuit||'':'')+'"></div>'+
      '<div class="campo"><label>Condición fiscal</label>'+
      '<select id="f-cat">'+opsCat+'</select></div>'+
    '</div>'+
    '<div class="campo" id="blq-mono" style="margin-top:14px"><label>Categoría Monotributo</label>'+
    '<select id="f-catm">'+opsMono+'</select></div>'+
    '<div class="campo" style="margin-top:14px"><label>Impuestos que llevás</label>'+
    '<div class="chk-grupo">'+chksImps+'</div></div>'+
    '<div class="seccion-titulo">Honorario mensual</div>'+
    '<div class="fila">'+
      '<div class="campo"><label>Importe</label>'+
      '<input type="number" id="f-honor" inputmode="decimal" step="1" placeholder="0" value="'+(c&&c.honor_importe?c.honor_importe:'')+'"></div>'+
      '<div class="campo"><label>Moneda</label>'+
      '<select id="f-honor-mon">'+
        '<option value="ARS"'+((!c||c.honor_moneda==='ARS')?' selected':'')+'>$ ARS</option>'+
        '<option value="USD"'+((c&&c.honor_moneda==='USD')?' selected':'')+'>U$D</option>'+
      '</select></div>'+
    '</div>'+
    '<div class="seccion-titulo">Contacto</div>'+
    '<div class="campo"><label>Teléfono</label>'+
    '<input type="tel" id="f-tel" placeholder="11 1234-5678" value="'+esc(c?c.telefono||'':'')+'"></div>'+
    '<div class="campo" style="margin-top:14px"><label>Email</label>'+
    '<input type="email" id="f-email" placeholder="cliente@ejemplo.com" value="'+esc(c?c.email||'':'')+'"></div>'+
    '<div class="campo" style="margin-top:14px"><label>Domicilio</label>'+
    '<input type="text" id="f-dom" placeholder="Calle 123, Ciudad" value="'+esc(c?c.domicilio||'':'')+'"></div>'+
    '<div class="seccion-titulo">Notas generales</div>'+
    '<div class="campo"><textarea id="f-notas" rows="3" placeholder="Observaciones generales...">'+esc(c?c.notas||'':'')+'</textarea></div>'+
    '<button class="btn-ok" id="f-ok">'+(esNuevo?'Crear cliente':'Guardar cambios')+'</button>'+
    (!esNuevo?'<button class="btn-danger" id="f-baja">Dar de baja cliente</button>':'')
  );

  abrirModal(esNuevo?'Nuevo cliente':'Editar cliente',html);

  var selCat=document.getElementById('f-cat');
  var blqMono=document.getElementById('blq-mono');
  function togMono(){blqMono.style.display=selCat.value==='Monotributo'?'block':'none';}
  selCat.addEventListener('change',togMono); togMono();

  document.getElementById('f-ok').addEventListener('click',function(){
    var nombre=document.getElementById('f-nombre').value.trim();
    if(!nombre){alert('El nombre es obligatorio.');return;}
    var impsSeleccionados=[];
    document.querySelectorAll('#modal-body input[name=imp]:checked').forEach(function(cb){impsSeleccionados.push(cb.value);});
    var obj={
      id:c?c.id:uid(),
      nombre:nombre,
      cuit:document.getElementById('f-cuit').value.trim(),
      cat_fiscal:document.getElementById('f-cat').value,
      cat_mono:document.getElementById('f-catm').value,
      impuestos:impsSeleccionados,
      honor_importe:parseFloat(document.getElementById('f-honor').value)||0,
      honor_moneda:document.getElementById('f-honor-mon').value,
      telefono:document.getElementById('f-tel').value.trim(),
      email:document.getElementById('f-email').value.trim(),
      domicilio:document.getElementById('f-dom').value.trim(),
      notas:document.getElementById('f-notas').value.trim(),
      activo:true
    };
    if(esNuevo){db.clientes.push(obj);}
    else{
      db.clientes=db.clientes.map(function(x){return x.id===obj.id?obj:x;});
      if(cliId===obj.id)renderBandaDetalle(obj);
    }
    guardar('clientes'); renderClientes(); renderMono(); cerrarModal();
  });

  var btnBaja=document.getElementById('f-baja');
  if(btnBaja){
    btnBaja.addEventListener('click',function(){
      if(!confirm('¿Dar de baja a '+c.nombre+'?'))return;
      db.clientes=db.clientes.map(function(x){return x.id===c.id?Object.assign({},x,{activo:false}):x;});
      guardar('clientes'); cerrarModal();
      if(cliId===c.id){cliId=null;irA('clientes');}
      renderClientes(); renderMono();
    });
  }
}

// ── DETALLE CLIENTE ───────────────────────────────────────────────────────────
function abrirCliente(id){
  cliId=id;
  var c=db.clientes.find(function(x){return x.id===id;});
  if(!c)return;
  renderBandaDetalle(c);
  irA('detalle');
  irSub('cc');
}

function renderBandaDetalle(c){
  var inic=c.nombre.split(' ').slice(0,2).map(function(p){return p[0]||'';}).join('');
  document.getElementById('det-avatar').textContent=inic.toUpperCase();
  document.getElementById('det-nombre').textContent=c.nombre;
  document.getElementById('det-cuit').textContent=c.cuit||'';
  var bcls=c.cat_fiscal==='Responsable Inscripto'?'b-ri':c.cat_fiscal==='Monotributo'?'b-mono':'b-ex';
  var bLabel=c.cat_fiscal==='Responsable Inscripto'?'R.I.':c.cat_fiscal==='Monotributo'?'Mono'+(c.cat_mono?' '+c.cat_mono:''):c.cat_fiscal;
  var imps=(c.impuestos&&c.impuestos.length)?c.impuestos.map(function(i){
    return '<span class="badge b-imp">'+esc(i)+'</span>';
  }).join(' '):'';
  document.getElementById('det-badges').innerHTML='<span class="badge '+bcls+'">'+esc(bLabel)+'</span> '+imps;
  var honorEl=document.getElementById('det-honor');
  if(c.honor_importe){
    honorEl.textContent=fmtMon(c.honor_importe,c.honor_moneda)+'/mes';
    honorEl.style.display='block';
  }else{
    honorEl.style.display='none';
  }
}

function irSub(s){
  sub=s;
  ['cc','historial','vtos','pres'].forEach(function(t){
    document.getElementById('sub-'+t).hidden=(t!==s);
  });
  document.querySelectorAll('#subtabs button[data-sub]').forEach(function(b){
    b.setAttribute('aria-selected',b.dataset.sub===s?'true':'false');
  });
  if(s==='cc')renderCC();
  else if(s==='historial')renderHistorial();
  else if(s==='vtos')renderVtos();
  else if(s==='pres')renderPres();
}

document.querySelectorAll('#subtabs button[data-sub]').forEach(function(b){
  b.addEventListener('click',function(){irSub(b.dataset.sub);});
});

document.getElementById('fab').addEventListener('click',function(){
  if(!cliId)return;
  if(sub==='cc')abrirFormCC(null);
  else if(sub==='historial')abrirFormNota(null);
  else if(sub==='vtos')abrirFormVto(null);
  else if(sub==='pres')abrirFormPres(null);
});

// ── CUENTA CORRIENTE ──────────────────────────────────────────────────────────
function renderCC(){
  if(!cliId)return;
  var movs=db.cc.filter(function(m){return m.cliente_id===cliId;})
    .sort(function(a,b){return b.fecha<a.fecha?-1:b.fecha>a.fecha?1:0;});
  var saldo=movs.reduce(function(a,m){return a+(m.tipo==='cargo'?m.importe:-m.importe);},0);
  var banner=document.getElementById('cc-banner');
  document.getElementById('cc-val').textContent=fmtARS(Math.abs(saldo));
  if(saldo>0.5){banner.className='saldo-banner saldo-debe';document.getElementById('cc-lbl').textContent='Saldo deudor (cliente debe)';}
  else if(saldo<-0.5){banner.className='saldo-banner saldo-favor';document.getElementById('cc-lbl').textContent='Saldo a favor del cliente';}
  else{banner.className='saldo-banner saldo-cero';document.getElementById('cc-lbl').textContent='Sin saldo pendiente';}
  var cont=document.getElementById('cc-lista');
  if(!movs.length){cont.innerHTML='<div class="vacio"><div class="vacio-ico">&#128200;</div>Sin movimientos.<br>Tocá + para agregar uno.</div>';return;}
  cont.innerHTML=movs.map(function(m){
    return (
      '<div class="item">'+
        '<div class="item-dot dot-'+m.tipo+'"></div>'+
        '<div class="item-body">'+
          '<div class="item-titulo">'+esc(m.concepto)+'</div>'+
          '<div class="item-sub">'+fmtFecha(m.fecha)+' · '+(m.tipo==='cargo'?'Cargo':'Pago')+'</div>'+
        '</div>'+
        '<div class="item-num num-'+m.tipo+'">'+(m.tipo==='cargo'?'+':'-')+fmtARS(m.importe)+'</div>'+
        '<button class="btn-del" data-id="'+m.id+'">&#10005;</button>'+
      '</div>'
    );
  }).join('');
  cont.querySelectorAll('.btn-del').forEach(function(b){
    b.addEventListener('click',function(e){
      e.stopPropagation();
      if(!confirm('¿Eliminar este movimiento?'))return;
      db.cc=db.cc.filter(function(m){return m.id!==b.dataset.id;});
      guardar('cc');renderCC();renderClientes();
    });
  });
}

function abrirFormCC(m){
  var html=(
    '<div class="campo"><label>Tipo</label>'+
    '<div class="seg">'+
      '<button aria-pressed="'+(!m||m.tipo==='cargo'?'true':'false')+'" data-t="cargo">Cargo</button>'+
      '<button aria-pressed="'+(m&&m.tipo==='pago'?'true':'false')+'" data-t="pago">Pago recibido</button>'+
    '</div></div>'+
    '<div class="fila" style="margin-top:14px">'+
      '<div class="campo"><label>Fecha</label>'+
      '<input type="date" id="f-fecha" value="'+(m?m.fecha:hoyISO())+'"></div>'+
      '<div class="campo"><label>Importe ($)</label>'+
      '<input type="number" id="f-imp" inputmode="decimal" step="1" placeholder="0" value="'+(m?m.importe:'')+'"></div>'+
    '</div>'+
    '<div class="campo" style="margin-top:14px"><label>Concepto</label>'+
    '<input type="text" id="f-conc" placeholder="Ej: Honorarios enero" value="'+esc(m?m.concepto:'')+'"></div>'+
    '<button class="btn-ok" id="f-ok">Guardar</button>'
  );
  abrirModal(!m?'Nuevo movimiento':'Editar movimiento',html);
  document.querySelectorAll('#modal-body .seg button').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('#modal-body .seg button').forEach(function(x){x.setAttribute('aria-pressed','false');});
      b.setAttribute('aria-pressed','true');
    });
  });
  document.getElementById('f-ok').addEventListener('click',function(){
    var tipoBtnEl=document.querySelector('#modal-body .seg button[aria-pressed=true]');
    var tipo=tipoBtnEl?tipoBtnEl.dataset.t:'cargo';
    var imp=parseFloat(document.getElementById('f-imp').value);
    var conc=document.getElementById('f-conc').value.trim();
    var fecha=document.getElementById('f-fecha').value;
    if(!imp||imp<=0||!conc||!fecha){alert('Completá todos los campos.');return;}
    var obj={id:m?m.id:uid(),cliente_id:cliId,fecha:fecha,concepto:conc,tipo:tipo,importe:imp};
    if(!m)db.cc.push(obj); else db.cc=db.cc.map(function(x){return x.id===obj.id?obj:x;});
    guardar('cc');renderCC();renderClientes();cerrarModal();
  });
}

// ── HISTORIAL ─────────────────────────────────────────────────────────────────
function renderHistorial(){
  if(!cliId)return;
  var lista=db.historial.filter(function(n){return n.cliente_id===cliId;})
    .sort(function(a,b){return b.fecha<a.fecha?-1:b.fecha>a.fecha?1:0;});
  var cont=document.getElementById('hist-lista');
  if(!lista.length){cont.innerHTML='<div class="vacio"><div class="vacio-ico">&#128221;</div>Sin notas.<br>Tocá + para agregar una.</div>';return;}
  cont.innerHTML=lista.map(function(n){
    return (
      '<div class="nota-item">'+
        '<div class="nota-fecha">'+fmtFecha(n.fecha)+'</div>'+
        '<div class="nota-texto">'+esc(n.texto)+'</div>'+
        '<div class="nota-actions"><button class="btn-del" data-id="'+n.id+'">Eliminar</button></div>'+
      '</div>'
    );
  }).join('');
  cont.querySelectorAll('.btn-del').forEach(function(b){
    b.addEventListener('click',function(){
      if(!confirm('¿Eliminar esta nota?'))return;
      db.historial=db.historial.filter(function(n){return n.id!==b.dataset.id;});
      guardar('historial');renderHistorial();
    });
  });
}

function abrirFormNota(n){
  var html=(
    '<div class="campo"><label>Fecha</label>'+
    '<input type="date" id="f-fecha" value="'+(n?n.fecha:hoyISO())+'"></div>'+
    '<div class="campo" style="margin-top:14px"><label>Nota</label>'+
    '<textarea id="f-texto" rows="5" placeholder="Registrá una llamada, reunión, aclaración...">'+esc(n?n.texto:'')+'</textarea></div>'+
    '<button class="btn-ok" id="f-ok">Guardar</button>'
  );
  abrirModal('Nueva nota',html);
  document.getElementById('f-ok').addEventListener('click',function(){
    var fecha=document.getElementById('f-fecha').value;
    var texto=document.getElementById('f-texto').value.trim();
    if(!fecha||!texto){alert('Completá todos los campos.');return;}
    var obj={id:n?n.id:uid(),cliente_id:cliId,fecha:fecha,texto:texto};
    if(!n)db.historial.push(obj); else db.historial=db.historial.map(function(x){return x.id===obj.id?obj:x;});
    guardar('historial');renderHistorial();cerrarModal();
  });
}

// ── VENCIMIENTOS ──────────────────────────────────────────────────────────────
function renderVtos(){
  if(!cliId)return;
  var lista=db.vtos.filter(function(v){return v.cliente_id===cliId;})
    .sort(function(a,b){
      if(a.cumplido!==b.cumplido)return a.cumplido?1:-1;
      return a.fecha<b.fecha?-1:a.fecha>b.fecha?1:0;
    });
  var cont=document.getElementById('vtos-lista');
  if(!lista.length){cont.innerHTML='<div class="vacio"><div class="vacio-ico">&#128197;</div>Sin vencimientos.<br>Tocá + para agregar uno<br>o usá el botón de generación AFIP.</div>';return;}
  cont.innerHTML=lista.map(function(v){
    var p=v.fecha.split('-');
    var dia=p[2]||''; var mes=MESES_CORTO[parseInt(p[1]||1,10)-1]||'';
    var dias=diasHasta(v.fecha);
    var eTxt='',eCls='';
    if(v.cumplido){eTxt='Cumplido';eCls='vto-ok';}
    else if(dias<0){eTxt='Vencido hace '+Math.abs(dias)+' días';eCls='vto-vencido';}
    else if(dias===0){eTxt='Vence hoy';eCls='vto-vencido';}
    else if(dias<=7){eTxt='Vence en '+dias+' días';eCls='vto-proximo';}
    else{eTxt='En '+dias+' días';eCls='vto-ok';}
    return (
      '<div class="vto-item">'+
        '<div class="vto-fecha-col"><div class="vto-dia">'+esc(dia)+'</div><div class="vto-mes">'+esc(mes)+'</div></div>'+
        '<div class="vto-info">'+
          '<div class="vto-concepto" style="'+(v.cumplido?'text-decoration:line-through;color:var(--muted)':'')+'">'  +esc(v.concepto)+'</div>'+
          '<div class="vto-estado '+eCls+'">'+eTxt+'</div>'+
        '</div>'+
        '<button class="btn-toggle-vto '+(v.cumplido?'cumplido':'')+'" data-id="'+v.id+'">'+(v.cumplido?'Hecho':'Marcar')+'</button>'+
        '<button class="btn-del" data-id="'+v.id+'">&#10005;</button>'+
      '</div>'
    );
  }).join('');
  cont.querySelectorAll('.btn-toggle-vto').forEach(function(b){
    b.addEventListener('click',function(){
      db.vtos=db.vtos.map(function(v){return v.id===b.dataset.id?Object.assign({},v,{cumplido:!v.cumplido}):v;});
      guardar('vtos');renderVtos();renderVtosGlobal();
    });
  });
  cont.querySelectorAll('.btn-del').forEach(function(b){
    b.addEventListener('click',function(e){
      e.stopPropagation();
      if(!confirm('¿Eliminar este vencimiento?'))return;
      db.vtos=db.vtos.filter(function(v){return v.id!==b.dataset.id;});
      guardar('vtos');renderVtos();renderVtosGlobal();
    });
  });
}

function abrirFormVto(v){
  var html=(
    '<div class="campo"><label>Fecha de vencimiento</label>'+
    '<input type="date" id="f-fecha" value="'+(v?v.fecha:hoyISO())+'"></div>'+
    '<div class="campo" style="margin-top:14px"><label>Concepto</label>'+
    '<input type="text" id="f-conc" placeholder="Ej: Vto. IVA" value="'+esc(v?v.concepto:'')+'"></div>'+
    '<button class="btn-ok" id="f-ok">Guardar</button>'
  );
  abrirModal(v?'Editar vencimiento':'Nuevo vencimiento',html);
  document.getElementById('f-ok').addEventListener('click',function(){
    var fecha=document.getElementById('f-fecha').value;
    var conc=document.getElementById('f-conc').value.trim();
    if(!fecha||!conc){alert('Completá todos los campos.');return;}
    var obj={id:v?v.id:uid(),cliente_id:cliId,fecha:fecha,concepto:conc,cumplido:v?v.cumplido:false};
    if(!v)db.vtos.push(obj); else db.vtos=db.vtos.map(function(x){return x.id===obj.id?obj:x;});
    guardar('vtos');renderVtos();renderVtosGlobal();cerrarModal();
  });
}

document.getElementById('btn-gen-vtos').addEventListener('click',function(){
  if(!cliId)return;
  var c=db.clientes.find(function(x){return x.id===cliId;});
  if(!c)return;
  var anioStr=prompt('Generar vencimientos AFIP para el año:',String(new Date().getFullYear()));
  if(!anioStr)return;
  var anio=parseInt(anioStr,10);
  if(isNaN(anio)||anio<2020||anio>2040){alert('Año inválido.');return;}
  var cuit=(c.cuit||'').replace(/[-\s]/g,'');
  var digit=parseInt(cuit.slice(-1))||0;
  var grupo=Math.floor(digit/2);
  var imps=c.impuestos||[];
  var nuevos=[];
  imps.forEach(function(imp){
    var cal=AFIP_CAL[imp];
    if(!cal)return;
    var dia=cal.dias[grupo];
    cal.meses.forEach(function(m){
      var fecha=anio+'-'+pad(m+1)+'-'+pad(dia);
      var concepto='Vto. '+imp+' - '+MESES[m]+' '+anio;
      var existe=db.vtos.some(function(v){return v.cliente_id===c.id&&v.fecha===fecha&&v.concepto===concepto;});
      if(!existe)nuevos.push({id:uid(),cliente_id:c.id,fecha:fecha,concepto:concepto,cumplido:false,auto:true});
    });
  });
  if(!nuevos.length){alert('No hay vencimientos nuevos para generar (ya existían o el cliente no tiene impuestos asignados).');return;}
  db.vtos=db.vtos.concat(nuevos);
  guardar('vtos');
  renderVtos();
  alert('Se generaron '+nuevos.length+' vencimientos para '+anio+'.\\nPodés editarlos o eliminarlos individualmente.');
});

// ── PRESUPUESTOS ──────────────────────────────────────────────────────────────
function presTotal(p){
  if(p.items&&p.items.length){
    return p.items.reduce(function(a,i){return a+((+i.cant||1)*(+i.precio||0));},0);
  }
  return p.importe||0;
}
function presMoneda(p){return p.moneda||'ARS';}

function renderPres(){
  if(!cliId)return;
  var lista=db.presupuestos.filter(function(p){return p.cliente_id===cliId;})
    .sort(function(a,b){return b.fecha<a.fecha?-1:b.fecha>a.fecha?1:0;});
  var cont=document.getElementById('pres-lista');
  if(!lista.length){cont.innerHTML='<div class="vacio"><div class="vacio-ico">&#128200;</div>Sin presupuestos.<br>Tocá + para agregar uno.</div>';return;}
  cont.innerHTML=lista.map(function(p){
    var total=presTotal(p);
    var mon=presMoneda(p);
    var items=p.items||[{desc:p.descripcion||'',cant:1,precio:p.importe||0}];
    var primeraLinea=items.length?esc(items[0].desc):'';
    var masLineas=items.length>1?' + '+(items.length-1)+' ítem'+(items.length>2?'s':''):'';
    var nroTxt=p.nro?'N° '+p.nro+' · ':'';
    return (
      '<div class="pres-item">'+
        '<div class="pres-top">'+
          '<div class="pres-desc">'+nroTxt+primeraLinea+'<span style="color:var(--muted);font-weight:400">'+masLineas+'</span></div>'+
          '<div class="pres-total">'+fmtMon(total,mon)+'</div>'+
        '</div>'+
        '<div class="pres-bot">'+
          '<span class="pres-fecha">'+fmtFecha(p.fecha)+'</span>'+
          '<div class="pres-acciones">'+
            '<button class="btn-pdf" data-id="'+p.id+'">PDF</button>'+
            '<button class="btn-estado est-'+p.estado+'" data-id="'+p.id+'">'+cap(p.estado)+'</button>'+
            '<button class="btn-del" data-id="'+p.id+'">&#10005;</button>'+
          '</div>'+
        '</div>'+
      '</div>'
    );
  }).join('');

  cont.querySelectorAll('.btn-pdf').forEach(function(b){
    b.addEventListener('click',function(e){
      e.stopPropagation();
      var p=db.presupuestos.find(function(x){return x.id===b.dataset.id;});
      var c=db.clientes.find(function(x){return x.id===cliId;});
      if(p&&c)generarPDF(p,c);
    });
  });
  cont.querySelectorAll('.btn-estado').forEach(function(b){
    b.addEventListener('click',function(){
      var p=db.presupuestos.find(function(x){return x.id===b.dataset.id;});
      if(!p)return;
      var next=ESTADOS_PRES[(ESTADOS_PRES.indexOf(p.estado)+1)%ESTADOS_PRES.length];
      db.presupuestos=db.presupuestos.map(function(x){return x.id===p.id?Object.assign({},x,{estado:next}):x;});
      guardar('presupuestos');renderPres();
    });
  });
  cont.querySelectorAll('.btn-del').forEach(function(b){
    b.addEventListener('click',function(e){
      e.stopPropagation();
      if(!confirm('¿Eliminar este presupuesto?'))return;
      db.presupuestos=db.presupuestos.filter(function(p){return p.id!==b.dataset.id;});
      guardar('presupuestos');renderPres();
    });
  });
  cont.querySelectorAll('.pres-desc,.pres-total').forEach(function(el){
    el.closest('.pres-item').addEventListener('click',function(e){
      if(e.target.tagName==='BUTTON')return;
      var id=el.closest('.pres-item').querySelector('.btn-del').dataset.id;
      var p=db.presupuestos.find(function(x){return x.id===id;});
      if(p)abrirFormPres(p);
    });
  });
}

var presLineas=[];

function renderLineas(){
  var cont=document.getElementById('pres-lineas');
  if(!cont)return;
  cont.innerHTML=presLineas.map(function(l,i){
    return (
      '<div class="pres-linea">'+
        '<input class="pres-linea-desc" type="text" placeholder="Descripción" value="'+esc(l.desc||'')+'" data-i="'+i+'" data-f="desc">'+
        '<input class="pres-linea-num" type="number" placeholder="Cant." value="'+(l.cant||1)+'" data-i="'+i+'" data-f="cant" min="0.01" step="any">'+
        '<input class="pres-linea-num" type="number" placeholder="Precio" value="'+(l.precio||'')+'" data-i="'+i+'" data-f="precio" min="0" step="1">'+
        '<button class="btn-del" data-i="'+i+'" title="Quitar">×</button>'+
      '</div>'
    );
  }).join('');
  cont.querySelectorAll('input').forEach(function(inp){
    inp.addEventListener('input',function(){
      var idx=parseInt(inp.dataset.i,10);
      var f=inp.dataset.f;
      if(f==='cant'||f==='precio')presLineas[idx][f]=parseFloat(inp.value)||0;
      else presLineas[idx][f]=inp.value;
      actualizarTotalPres();
    });
  });
  cont.querySelectorAll('.btn-del').forEach(function(b){
    b.addEventListener('click',function(){
      presLineas.splice(parseInt(b.dataset.i,10),1);
      renderLineas();
      actualizarTotalPres();
    });
  });
}

function actualizarTotalPres(){
  var total=presLineas.reduce(function(a,l){return a+((+l.cant||1)*(+l.precio||0));},0);
  var el=document.getElementById('pres-total-display');
  var monEl=document.getElementById('f-mon');
  var mon=monEl?monEl.value:'ARS';
  if(el)el.textContent=fmtMon(total,mon);
}

function abrirFormPres(p){
  var esNuevo=!p;
  // Normalizar items (compat con formato viejo)
  presLineas=p&&p.items&&p.items.length
    ?p.items.map(function(i){return {id:i.id,desc:i.desc||'',cant:+i.cant||1,precio:+i.precio||0};})
    :[{id:uid(),desc:p?p.descripcion||'':'',cant:1,precio:p?p.importe||0:0}];

  var nroActual=p&&p.nro?p.nro:db.presupuestos.length+1;

  var html=(
    '<div class="fila">'+
      '<div class="campo"><label>Fecha</label>'+
      '<input type="date" id="f-fecha" value="'+(p?p.fecha:hoyISO())+'"></div>'+
      '<div class="campo"><label>Moneda</label>'+
      '<select id="f-mon">'+
        '<option value="ARS"'+((!p||presMoneda(p)==='ARS')?' selected':'')+'>$ ARS</option>'+
        '<option value="USD"'+((p&&presMoneda(p)==='USD')?' selected':'')+'>U$D</option>'+
      '</select></div>'+
    '</div>'+
    '<div class="seccion-titulo" style="margin-top:16px">Items</div>'+
    '<div id="pres-lineas"></div>'+
    '<button class="btn-add-linea" id="btn-add-linea">+ Agregar ítem</button>'+
    '<div class="pres-total-row">'+
      '<span class="pres-total-lbl">Total</span>'+
      '<span class="pres-total-val" id="pres-total-display"></span>'+
    '</div>'+
    '<div class="seccion-titulo">Notas / condiciones</div>'+
    '<div class="campo"><textarea id="f-notas" rows="3" placeholder="Validez, condiciones de pago...">'+esc(p?p.notas||'':'')+'</textarea></div>'+
    '<button class="btn-ok" id="f-ok">'+(esNuevo?'Crear presupuesto':'Guardar cambios')+'</button>'
  );
  abrirModal(esNuevo?'Nuevo presupuesto':'Editar presupuesto',html);
  renderLineas();
  actualizarTotalPres();

  document.getElementById('f-mon').addEventListener('change',actualizarTotalPres);

  document.getElementById('btn-add-linea').addEventListener('click',function(){
    presLineas.push({id:uid(),desc:'',cant:1,precio:0});
    renderLineas();
    actualizarTotalPres();
  });

  document.getElementById('f-ok').addEventListener('click',function(){
    var fecha=document.getElementById('f-fecha').value;
    if(!fecha){alert('Ingresá la fecha.');return;}
    // Leer valores actuales del DOM
    var inputs=document.querySelectorAll('#pres-lineas input');
    var itemsDOM=[];
    var lineaActual={};
    inputs.forEach(function(inp){
      var i=parseInt(inp.dataset.i,10);
      if(!itemsDOM[i])itemsDOM[i]={};
      var f=inp.dataset.f;
      if(f==='cant'||f==='precio')itemsDOM[i][f]=parseFloat(inp.value)||0;
      else itemsDOM[i][f]=inp.value;
    });
    var itemsFinal=presLineas.map(function(l,i){
      var dom=itemsDOM[i]||{};
      return {
        id:l.id||uid(),
        desc:dom.desc!==undefined?dom.desc:l.desc,
        cant:dom.cant!==undefined?dom.cant:l.cant,
        precio:dom.precio!==undefined?dom.precio:l.precio
      };
    }).filter(function(l){return l.desc||l.precio;});
    if(!itemsFinal.length){alert('Agregá al menos un ítem.');return;}
    var mon=document.getElementById('f-mon').value;
    var obj={
      id:p?p.id:uid(),
      cliente_id:cliId,
      nro:nroActual,
      fecha:fecha,
      moneda:mon,
      estado:p?p.estado:'pendiente',
      notas:document.getElementById('f-notas').value.trim(),
      items:itemsFinal
    };
    if(esNuevo)db.presupuestos.push(obj);
    else db.presupuestos=db.presupuestos.map(function(x){return x.id===obj.id?obj:x;});
    guardar('presupuestos');renderPres();cerrarModal();
  });
}

function generarPDF(p,c){
  var items=p.items&&p.items.length?p.items:[{desc:p.descripcion||'',cant:1,precio:p.importe||0}];
  var mon=presMoneda(p);
  var total=presTotal(p);
  var filas=items.map(function(it){
    var sub=(+it.cant||1)*(+it.precio||0);
    return '<tr><td>'+esc(it.desc||'')+'</td><td style="text-align:center">'+((+it.cant||1).toLocaleString('es-AR'))+'</td><td style="text-align:right">'+fmtMon(+it.precio||0,mon)+'</td><td style="text-align:right;font-weight:600">'+fmtMon(sub,mon)+'</td></tr>';
  }).join('');
  var html=(
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'+
    '<title>Presupuesto N° '+esc(String(p.nro||''))+'</title>'+
    '<style>'+
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1c1917;margin:0;padding:0;background:#fff}'+
    '.page{max-width:760px;margin:0 auto;padding:48px 48px 64px}'+
    '.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}'+
    '.logo-ar{font-family:Georgia,serif;font-style:italic;font-size:52px;color:#3d3d3d;line-height:1;letter-spacing:-.02em}'+
    '.logo-sub{font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:#a8a29e;margin-top:4px}'+
    '.firma{text-align:right;font-size:13px;color:#57534e;line-height:1.7}'+
    '.firma strong{font-size:15px;color:#1c1917;display:block}'+
    '.acento{height:3px;background:#f97316;border-radius:2px;margin:20px 0 28px}'+
    '.titulo-doc{font-size:26px;font-weight:700;color:#1c1917;margin-bottom:6px}'+
    '.nro{font-size:14px;color:#78716c;margin-bottom:20px}'+
    '.datos-cli{background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:13px;line-height:1.8}'+
    '.datos-cli strong{color:#1c1917}'+
    'table{width:100%;border-collapse:collapse;font-size:13px}'+
    'thead th{background:#f5f3ef;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;font-weight:600}'+
    'tbody td{padding:10px 12px;border-bottom:1px solid #f5f3ef}'+
    'tfoot td{padding:12px;font-size:15px;font-weight:700;border-top:2px solid #e7e5e4;color:#f97316}'+
    '.notas{margin-top:28px;font-size:12px;color:#78716c;line-height:1.6;border-top:1px solid #e7e5e4;padding-top:18px}'+
    '.footer{margin-top:48px;text-align:center;font-size:11px;color:#a8a29e;letter-spacing:.04em}'+
    '@media print{body{margin:0}.page{padding:32px 40px}button{display:none!important}}'+
    '</style></head><body>'+
    '<div class="page">'+
    '<div class="hdr">'+
      '<div><div class="logo-ar">AR</div><div class="logo-sub">Estudio Contable</div></div>'+
      '<div class="firma"><strong>Rypstra Aldana S.</strong>Contadora Pública<br>(+54) 2257-508881<br>cra.rypstra@gmail.com</div>'+
    '</div>'+
    '<div class="acento"></div>'+
    '<div class="titulo-doc">Presupuesto</div>'+
    '<div class="nro">N° '+esc(String(p.nro||''))+ ' &nbsp;&middot;&nbsp; Fecha: '+fmtFecha(p.fecha)+'</div>'+
    '<div class="datos-cli">'+
      '<strong>'+esc(c.nombre)+'</strong>'+
      (c.cuit?'<br>CUIT: '+esc(c.cuit):'')+
      (c.email?'<br>'+esc(c.email):'')+
    '</div>'+
    '<table>'+
    '<thead><tr><th>Descripción</th><th style="text-align:center;width:70px">Cant.</th><th style="text-align:right;width:120px">Precio unit.</th><th style="text-align:right;width:120px">Subtotal</th></tr></thead>'+
    '<tbody>'+filas+'</tbody>'+
    '<tfoot><tr><td colspan="3" style="text-align:right;font-size:12px;color:#78716c;font-weight:400">TOTAL</td><td style="text-align:right">'+fmtMon(total,mon)+'</td></tr></tfoot>'+
    '</table>'+
    (p.notas?'<div class="notas"><strong>Condiciones:</strong> '+esc(p.notas)+'</div>':'')+
    '<div class="footer">Este presupuesto tiene validez de 15 días corridos desde la fecha de emisión.</div>'+
    '</div>'+
    '<scr'+'ipt>window.onload=function(){window.print();}<'+'/scri'+'pt>'+
    '</body></html>'
  );
  var w=window.open('','_blank');
  if(w){w.document.write(html);w.document.close();}
}

// ── MONOTRIBUTO ───────────────────────────────────────────────────────────────
function renderMono(){
  document.getElementById('mono-label').textContent=periodoStr(monoMes.y,monoMes.m);
  var key=periodoKey(monoMes.y,monoMes.m);
  var clis=db.clientes.filter(function(c){return c.activo!==false&&c.cat_fiscal==='Monotributo';})
    .sort(function(a,b){return a.nombre.localeCompare(b.nombre,'es');});
  var cont=document.getElementById('lista-mono');
  if(!clis.length){cont.innerHTML='<div class="vacio"><div class="vacio-ico">&#128203;</div>No tenés clientes Monotributistas.</div>';return;}
  cont.innerHTML=clis.map(function(c){
    var reg=db.mono.find(function(r){return r.cliente_id===c.id&&r.periodo===key;});
    var pagado=reg?!!reg.pagado:false;
    return (
      '<div class="mono-card">'+
        '<div class="mono-top">'+
          '<div class="mono-nombre">'+esc(c.nombre)+'</div>'+
          (c.cat_mono?'<span class="badge b-mono">Cat. '+esc(c.cat_mono)+'</span>':'')+
        '</div>'+
        '<div class="mono-row">'+
          '<span class="mono-lbl">'+(pagado?'Pago registrado':'Pendiente de pago')+'</span>'+
          '<label class="switch">'+
            '<input type="checkbox"'+(pagado?' checked':'')+' data-cid="'+c.id+'" data-key="'+key+'">'+
            '<span class="sw-track"></span><span class="sw-thumb"></span>'+
          '</label>'+
        '</div>'+
      '</div>'
    );
  }).join('');
  cont.querySelectorAll('input[type=checkbox]').forEach(function(sw){
    sw.addEventListener('change',function(){
      var cid=sw.dataset.cid,per=sw.dataset.key;
      var reg=db.mono.find(function(r){return r.cliente_id===cid&&r.periodo===per;});
      if(reg)reg.pagado=sw.checked;
      else db.mono.push({id:uid(),cliente_id:cid,periodo:per,pagado:sw.checked});
      guardar('mono');
      var lbl=sw.closest('.mono-row').querySelector('.mono-lbl');
      if(lbl)lbl.textContent=sw.checked?'Pago registrado':'Pendiente de pago';
    });
  });
}

document.getElementById('mono-prev').addEventListener('click',function(){
  monoMes.m--;if(monoMes.m<0){monoMes.m=11;monoMes.y--;}renderMono();
});
document.getElementById('mono-next').addEventListener('click',function(){
  monoMes.m++;if(monoMes.m>11){monoMes.m=0;monoMes.y++;}renderMono();
});

// ── VENCIMIENTOS GLOBAL ───────────────────────────────────────────────────────
function renderVtosGlobal(){
  document.getElementById('vtos-label').textContent=periodoStr(vtosMes.y,vtosMes.m);
  var mesStr=vtosMes.y+'-'+pad(vtosMes.m+1);
  var lista=db.vtos.filter(function(v){return v.fecha&&v.fecha.startsWith(mesStr);})
    .sort(function(a,b){
      if(a.cumplido!==b.cumplido)return a.cumplido?1:-1;
      return a.fecha<b.fecha?-1:a.fecha>b.fecha?1:0;
    });
  var cont=document.getElementById('vtos-global-lista');
  if(!lista.length){
    cont.innerHTML='<div class="vacio"><div class="vacio-ico">&#128197;</div>Sin vencimientos para este mes.</div>';
    return;
  }
  cont.innerHTML=lista.map(function(v){
    var p=v.fecha.split('-');
    var dia=p[2]||''; var mes=MESES_CORTO[parseInt(p[1]||1,10)-1]||'';
    var cli=db.clientes.find(function(c){return c.id===v.cliente_id;});
    var clinombre=cli?cli.nombre:'';
    var dias=diasHasta(v.fecha);
    var eTxt='',eCls='';
    if(v.cumplido){eTxt='Cumplido';eCls='vto-ok';}
    else if(dias<0){eTxt='Vencido hace '+Math.abs(dias)+' días';eCls='vto-vencido';}
    else if(dias===0){eTxt='Hoy';eCls='vto-vencido';}
    else if(dias<=7){eTxt='En '+dias+' días';eCls='vto-proximo';}
    else{eTxt='En '+dias+' días';eCls='vto-ok';}
    return (
      '<div class="vto-item">'+
        '<div class="vto-fecha-col"><div class="vto-dia">'+esc(dia)+'</div><div class="vto-mes">'+esc(mes)+'</div></div>'+
        '<div class="vto-info">'+
          '<div class="vto-concepto" style="'+(v.cumplido?'text-decoration:line-through;color:var(--muted)':'')+'">'  +esc(v.concepto)+'</div>'+
          (clinombre?'<div class="vto-cli-nombre">'+esc(clinombre)+'</div>':'')+
          '<div class="vto-estado '+eCls+'">'+eTxt+'</div>'+
        '</div>'+
        '<button class="btn-toggle-vto '+(v.cumplido?'cumplido':'')+'" data-id="'+v.id+'">'+(v.cumplido?'Hecho':'Marcar')+'</button>'+
      '</div>'
    );
  }).join('');
  cont.querySelectorAll('.btn-toggle-vto').forEach(function(b){
    b.addEventListener('click',function(){
      db.vtos=db.vtos.map(function(v){return v.id===b.dataset.id?Object.assign({},v,{cumplido:!v.cumplido}):v;});
      guardar('vtos');renderVtosGlobal();
      if(cliId)renderVtos();
    });
  });
}

document.getElementById('vtos-prev').addEventListener('click',function(){
  vtosMes.m--;if(vtosMes.m<0){vtosMes.m=11;vtosMes.y--;}renderVtosGlobal();
});
document.getElementById('vtos-next').addEventListener('click',function(){
  vtosMes.m++;if(vtosMes.m>11){vtosMes.m=0;vtosMes.y++;}renderVtosGlobal();
});

// ── AJUSTES ───────────────────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click',function(){
  var blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download='estudio-backup-'+hoyISO()+'.json';a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('btn-import').addEventListener('click',function(){
  document.getElementById('arch-import').click();
});
document.getElementById('arch-import').addEventListener('change',function(e){
  var f=e.target.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(ev){
    try{
      var d=JSON.parse(ev.target.result);
      if(!d.clientes)throw new Error('Formato inválido');
      if(!confirm('¿Reemplazar todos los datos con la copia importada?'))return;
      db=d;
      Promise.all(['clientes','cc','historial','vtos','presupuestos','mono'].map(guardar))
        .then(function(){renderTodo();alert('Importación exitosa.');});
    }catch(ex){alert('Archivo no válido: '+ex.message);}
  };
  r.readAsText(f);
  e.target.value='';
});

// ── MODAL ─────────────────────────────────────────────────────────────────────
function abrirModal(titulo,html){
  document.getElementById('modal-titulo').textContent=titulo;
  document.getElementById('modal-body').innerHTML=html;
  document.getElementById('modal').classList.add('open');
}
function cerrarModal(){
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modal-body').innerHTML='';
}
document.getElementById('modal-x').addEventListener('click',cerrarModal);
document.getElementById('modal').addEventListener('click',function(e){if(e.target===this)cerrarModal();});

// ── RENDER GLOBAL ─────────────────────────────────────────────────────────────
function renderTodo(){
  renderClientes();
  renderMono();
  renderVtosGlobal();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(function(){});
}
irA('inicio');
cargar();

})();
</script>`;

// ─── WORKER ───────────────────────────────────────────────────────────────────
const ALLOWED = new Set(['clientes','cc','historial','vtos','presupuestos','mono']);

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (path === '/sw.js') {
      return new Response(SW_CODE, { headers: { 'content-type': 'application/javascript;charset=utf-8' } });
    }
    if (path === '/manifest.json') {
      return new Response(MANIFEST, { headers: { 'content-type': 'application/manifest+json;charset=utf-8' } });
    }
    if (path.startsWith('/api/')) {
      const key = path.slice(5);
      if (!ALLOWED.has(key)) return new Response('Not found', { status: 404 });
      if (request.method === 'GET') {
        const val = await env.ESTUDIO.get(key);
        return new Response(val ?? '[]', { headers: { 'content-type': 'application/json;charset=utf-8' } });
      }
      if (request.method === 'PUT') {
        await env.ESTUDIO.put(key, await request.text());
        return new Response('ok');
      }
      return new Response('Method not allowed', { status: 405 });
    }

    const html = HTML.replace(/__SYNC_BASE__/g, url.origin);
    return new Response(html, {
      headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' },
    });
  },
};

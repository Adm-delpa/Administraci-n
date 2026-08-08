// Mis cuentas — Cloudflare Worker
// Sirve la app, maneja la API de sync y el service worker para PWA.

// ─── SERVICE WORKER ──────────────────────────────────────────────────────────

const SW_CODE = `
const CACHE = 'mis-cuentas-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api')) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      fetch(e.request)
        .then(r => { if (r && r.status === 200) cache.put(e.request, r.clone()); return r; })
        .catch(() => cache.match(e.request))
    )
  );
});
`;

// ─── MANIFEST ────────────────────────────────────────────────────────────────

const MANIFEST_TPL = JSON.stringify({
  name: 'Mis cuentas',
  short_name: 'Mis cuentas',
  description: 'Finanzas personales',
  start_url: '/__TOKEN__',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#0d1e19',
  theme_color: '#0d1e19',
  icons: [{
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='100' fill='%230e2321'/%3E%3Ctext x='80' y='410' font-size='360'%3E%F0%9F%92%B0%3C/text%3E%3C/svg%3E",
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any maskable'
  }]
}, null, 2);

// ─── APP HTML ─────────────────────────────────────────────────────────────────
// __SYNC_BASE__ y __MANIFEST_URL__ son reemplazados por el worker en cada request.

const HTML = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Mis cuentas</title>
<link rel="manifest" href="__MANIFEST_URL__">
<meta name="theme-color" content="#0d1e19">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Mis cuentas">
<script id="datos-embebidos" type="application/json">null</script>
<style>
  :root{
    --papel:#0d1e19;
    --tinta:#d8eae6;
    --hoja:#162d26;
    --linea:#1c3d32;
    --tenue:#4d7c74;
    --ingreso:#34c9a0;
    --egreso:#e8685a;
    --mueve:#c49b3c;
    --acento:#c49b3c;
    --hoja-seg:#0f2620;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  }
  @media(prefers-color-scheme:light){
    :root{
      --papel:#f0f5f3;
      --tinta:#0d1e19;
      --hoja:#ffffff;
      --linea:#c5dad6;
      --tenue:#4a7268;
      --ingreso:#0d6e56;
      --egreso:#a83020;
      --mueve:#9a7530;
      --acento:#9a7530;
      --hoja-seg:#eaf1ef;
    }
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;padding:0}
  body{
    background:var(--papel);color:var(--tinta);font-family:var(--sans);
    font-size:16px;line-height:1.45;padding-bottom:96px;
  }
  .wrap{max-width:720px;margin:0 auto;padding:0 14px}

  /* encabezado */
  header{
    background:var(--papel);color:var(--tinta);padding:12px 0 0;
    padding-top:calc(12px + env(safe-area-inset-top));
    border-bottom:1px solid var(--linea);
  }
  .marca{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .marca h1{font-size:12px;margin:0;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--tenue)}
  .estado{font-size:11px;color:var(--tenue);font-family:var(--mono)}
  .neto-cabeza{padding:6px 0 10px}
  .neto-ars{font-size:28px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1;color:var(--tinta)}
  .neto-usd{font-size:14px;color:var(--tenue);font-variant-numeric:tabular-nums;margin-top:4px;letter-spacing:-.01em}

  /* tira de saldos */
  .tira{display:flex;gap:8px;overflow-x:auto;margin-top:2px;padding-bottom:14px;scrollbar-width:none}
  .tira::-webkit-scrollbar{display:none}
  .saldo{
    flex:0 0 auto;min-width:110px;background:var(--hoja);border-radius:10px;
    padding:9px 12px 10px;border:1px solid var(--linea);
  }
  .saldo.debe{border-color:var(--mueve)}
  .saldo.usd{border-color:#1c3050}
  .saldo .n{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--tenue);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
  .saldo .v{font-family:var(--mono);font-size:16px;margin-top:4px;font-variant-numeric:tabular-nums;
    letter-spacing:-.02em;font-weight:600}
  .saldo.usd .v{color:#7ec8e8}
  .saldo.debe .v{color:var(--mueve)}
  .saldo .v.neg{color:var(--egreso)}
  .vacio-tira{font-size:13px;color:var(--tenue);padding:12px 0 4px}

  /* pestañas */
  nav{
    position:fixed;left:0;right:0;bottom:0;background:var(--papel);
    border-top:1px solid var(--linea);display:flex;z-index:20;
    padding-bottom:env(safe-area-inset-bottom);
  }
  nav button{
    flex:1;background:none;border:0;border-top:2px solid transparent;
    padding:8px 2px 10px;font-family:var(--sans);
    font-size:10px;color:var(--tenue);cursor:pointer;letter-spacing:.04em;
    display:flex;flex-direction:column;align-items:center;gap:3px;
    transition:color .12s,border-color .12s;
  }
  nav button svg{width:20px;height:20px}
  nav button[aria-selected="true"]{color:var(--tinta);border-top-color:var(--acento)}

  section[hidden]{display:none}
  section{padding-top:16px}

  h2{font-size:10px;text-transform:uppercase;letter-spacing:.11em;color:var(--tenue);
    margin:22px 0 8px;font-weight:600}
  h2:first-child{margin-top:2px}

  .tarjeta{background:var(--hoja);border:1px solid var(--linea);border-radius:10px;padding:14px}

  /* formulario */
  .seg{display:flex;border:1px solid var(--linea);border-radius:8px;overflow:hidden;background:var(--hoja-seg)}
  .seg button{
    flex:1;padding:10px 4px;background:none;border:0;font-family:var(--sans);font-size:13.5px;
    color:var(--tenue);cursor:pointer;border-right:1px solid var(--linea);font-weight:500
  }
  .seg button:last-child{border-right:0}
  .seg button[aria-pressed="true"]{color:#fff;background:var(--tinta)}
  .seg button[aria-pressed="true"][data-t="Ingreso"]{background:var(--ingreso);color:#0a1812}
  .seg button[aria-pressed="true"][data-t="Egreso"]{background:var(--egreso);color:#fff}
  .seg button[aria-pressed="true"][data-t="Transferencia"]{background:var(--mueve);color:#0a1812}
  .seg button[aria-pressed="true"][data-l="egreso"]{background:var(--egreso);color:#fff}
  .seg button[aria-pressed="true"][data-l="ingreso"]{background:var(--ingreso);color:#0a1812}

  label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.07em;
    color:var(--tenue);margin:13px 0 5px;font-weight:600}
  input,select,textarea{
    width:100%;padding:11px 10px;font-size:16px;font-family:var(--sans);
    border:1px solid var(--linea);border-radius:8px;background:var(--hoja);color:var(--tinta)
  }
  input[type=number]{font-family:var(--mono);font-variant-numeric:tabular-nums}
  input:focus,select:focus{outline:2px solid var(--acento);outline-offset:1px}
  .fila{display:flex;gap:9px}
  .fila>div{flex:1;min-width:0}
  .pista{font-size:12px;color:var(--tenue);margin-top:6px;line-height:1.35}

  .btn{
    width:100%;padding:13px;border:0;border-radius:8px;background:var(--acento);color:#0a1812;
    font-size:15px;font-family:var(--sans);font-weight:700;cursor:pointer;margin-top:18px
  }
  .btn.chico{width:auto;padding:9px 14px;font-size:13px;margin-top:0;font-weight:600}
  .btn.linea{background:none;border:1px solid var(--linea);color:var(--tinta);font-weight:600}

  /* listados */
  .mov{display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid var(--linea)}
  .mov:last-child{border-bottom:0}
  .mov .marca-t{width:8px;height:8px;border-radius:50%;flex:0 0 8px;margin-top:6px;background:var(--tenue)}
  .mov .cuerpo{flex:1;min-width:0}
  .mov .t1{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mov .t2{font-size:11.5px;color:var(--tenue);font-family:var(--mono);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mov .imp{font-family:var(--mono);font-size:14px;font-variant-numeric:tabular-nums;
    text-align:right;white-space:nowrap;letter-spacing:-.02em;font-weight:700}
  .mov.Ingreso .imp{color:var(--ingreso)}
  .mov.Egreso .imp{color:var(--egreso)}
  .mov.Transferencia .imp{color:var(--mueve)}
  .borrar{background:none;border:0;color:var(--tenue);font-size:17px;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0}

  /* tabla libro mayor */
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--tenue);
    text-align:right;padding:0 0 7px;font-weight:600;border-bottom:1px solid var(--linea)}
  th:first-child{text-align:left}
  td{padding:7px 0;border-bottom:1px solid var(--linea);font-family:var(--mono);
    font-variant-numeric:tabular-nums;text-align:right;letter-spacing:-.02em;white-space:nowrap}
  td:first-child{font-family:var(--sans);text-align:left;letter-spacing:0;white-space:normal}
  tr.total td{font-weight:700;border-bottom:2px solid var(--tinta);border-top:1px solid var(--tinta)}
  tr.neto td{font-weight:700;border-bottom:0}
  .cero{color:var(--tenue)}

  .aviso{font-size:13px;color:var(--tenue);padding:18px 2px;line-height:1.5}
  .banner{background:#2a1e0a;border:1px solid #6b4d1a;border-radius:9px;padding:11px 13px;
    font-size:13px;margin-top:14px;line-height:1.45;color:#e6c377}
  @media(prefers-color-scheme:light){.banner{background:#fdf3d8;border-color:#e2c980;color:#5a3d0a}}
  select.mes{font-family:var(--mono);font-weight:600}
  .persona{display:flex;justify-content:space-between;align-items:baseline;gap:10px;
    padding:11px 0;border-bottom:1px solid var(--linea)}
  .persona:last-child{border-bottom:0}
  .persona .d{font-size:12px;color:var(--tenue);font-family:var(--mono);margin-top:2px}
  .persona .m{font-family:var(--mono);font-size:15px;font-variant-numeric:tabular-nums;color:var(--mueve);font-weight:700}
  .persona.saldada .m{color:var(--tenue);font-weight:400}
  .leyenda{display:flex;gap:16px;font-size:12px;color:var(--tenue);margin:0 0 10px}
  .leyenda i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}
  .grafico{background:var(--hoja);border:1px solid var(--linea);border-radius:10px;
    padding:12px 12px 8px;margin-bottom:12px}
  .grafico .mon{font-size:10px;text-transform:uppercase;letter-spacing:.09em;
    color:var(--tenue);font-weight:600;margin-bottom:6px}
  .chip{display:flex;justify-content:space-between;align-items:center;gap:8px;
    padding:8px 0;border-bottom:1px solid var(--linea);font-size:14px}
  .chip:last-child{border-bottom:0}
  .chip .uso{font-size:11px;color:var(--tenue);font-family:var(--mono)}
  @media(prefers-reduced-motion:no-preference){
    section{animation:sube .18s ease-out}
    @keyframes sube{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  }
</style>

<header>
  <div class="wrap">
    <div class="marca">
      <h1>Mis cuentas</h1>
      <span class="estado" id="estado"></span>
    </div>
    <div class="neto-cabeza" id="neto-cabeza"></div>
    <div class="tira" id="tira"></div>
  </div>
</header>

<div class="wrap">

<!-- CARGAR -->
<section id="s-cargar">
  <div class="seg" id="seg-tipo">
    <button data-t="Egreso" aria-pressed="true">Egreso</button>
    <button data-t="Ingreso" aria-pressed="false">Ingreso</button>
    <button data-t="Transferencia" aria-pressed="false">Movimiento</button>
  </div>

  <div id="sin-cuentas" class="banner" hidden>
    Todavía no tenés cuentas. Andá a <b>Cuentas</b> y creá al menos una para poder cargar movimientos.
  </div>

  <div id="formulario">
    <div class="fila">
      <div>
        <label for="f-fecha">Fecha</label>
        <input type="date" id="f-fecha">
      </div>
      <div>
        <label for="f-monto" id="lbl-monto">Monto</label>
        <input type="number" id="f-monto" inputmode="decimal" step="0.01" placeholder="0,00">
      </div>
    </div>

    <div id="bloque-cat">
      <label for="f-cat">Categoría</label>
      <select id="f-cat"></select>
    </div>

    <div id="bloque-cuenta">
      <label for="f-cuenta" id="lbl-cuenta">Cuenta</label>
      <select id="f-cuenta"></select>
    </div>

    <div id="bloque-transf" hidden>
      <div class="fila">
        <div>
          <label for="f-origen">Sale de</label>
          <select id="f-origen"></select>
        </div>
        <div>
          <label for="f-destino">Entra en</label>
          <select id="f-destino"></select>
        </div>
      </div>
      <div id="bloque-cambio" hidden>
        <label for="f-monto-dest" id="lbl-dest">Monto que entra</label>
        <input type="number" id="f-monto-dest" inputmode="decimal" step="0.01" placeholder="0,00">
        <div class="pista" id="pista-cambio">Las cuentas son de distinta moneda, así que hace falta el monto de los dos lados.</div>
      </div>
      <div id="bloque-persona" hidden>
        <label for="f-persona">Quién</label>
        <input type="text" id="f-persona" placeholder="Nombre de la persona">
      </div>
    </div>

    <label for="f-desc">Detalle <span style="text-transform:none;letter-spacing:0;font-weight:400">(opcional)</span></label>
    <input type="text" id="f-desc" placeholder="Ej: verdulería">

    <button class="btn" id="guardar-mov">Guardar movimiento</button>
  </div>

  <h2>Últimos movimientos</h2>
  <div class="tarjeta" id="lista-movs"></div>
</section>

<!-- CUENTAS -->
<section id="s-cuentas" hidden>
  <h2>Tus cuentas</h2>
  <div class="tarjeta" id="lista-cuentas"></div>

  <h2>Agregar una cuenta</h2>
  <div class="tarjeta">
    <label for="c-nombre">Nombre</label>
    <input type="text" id="c-nombre" placeholder="Ej: Banco Nación, Efectivo, Mercado Pago">
    <div class="fila">
      <div>
        <label for="c-moneda">Moneda</label>
        <select id="c-moneda"><option value="ARS">Pesos</option><option value="USD">Dólares</option></select>
      </div>
      <div>
        <label for="c-saldo">Saldo inicial</label>
        <input type="number" id="c-saldo" inputmode="decimal" step="0.01" placeholder="0,00">
      </div>
    </div>
    <div class="pista">El saldo inicial es lo que hay en esa cuenta hoy, antes de empezar a cargar movimientos.</div>
    <button class="btn" id="guardar-cuenta">Agregar cuenta</button>
  </div>

  <h2>Categorías</h2>
  <div class="tarjeta">
    <div class="seg" id="seg-cat">
      <button data-l="egreso" aria-pressed="true">De egreso</button>
      <button data-l="ingreso" aria-pressed="false">De ingreso</button>
    </div>
    <div id="lista-cats" style="margin-top:6px"></div>
    <div class="fila" style="margin-top:12px">
      <div style="flex:2"><input type="text" id="cat-nombre" placeholder="Nueva categoría"></div>
      <button class="btn chico" id="agregar-cat" style="flex:1">Agregar</button>
    </div>
    <div class="pista">Una categoría que ya tenga movimientos cargados no se puede borrar.</div>
  </div>

  <h2>Copia de seguridad</h2>
  <div class="tarjeta">
    <div class="pista" style="margin:0 0 12px">
      Tus datos se guardan solos en este navegador y en la nube. Descargá una copia para tenerla también de forma local.
    </div>
    <button class="btn" id="exportar-xls" style="margin-top:0">Descargar Excel</button>
    <div class="fila" style="margin-top:9px">
      <button class="btn chico linea" id="exportar" style="flex:1">Copia de respaldo</button>
      <button class="btn chico linea" id="importar" style="flex:1">Restaurar copia</button>
    </div>
    <div class="pista">
      El Excel es para mirar y guardar. Para volver a cargar tus datos en esta app usá la copia de respaldo.
    </div>
    <input type="file" id="archivo" accept=".json,application/json" hidden>
  </div>
</section>

<!-- RESUMEN -->
<section id="s-resumen" hidden>
  <label for="sel-mes" style="margin-top:0">Mes</label>
  <select id="sel-mes" class="mes"></select>
  <div id="cuerpo-resumen"></div>
</section>

<!-- GRAFICOS -->
<section id="s-graficos" hidden>
  <h2>Ingresos y egresos por mes</h2>
  <div class="leyenda">
    <span><i style="background:var(--ingreso)"></i>Ingresos</span>
    <span><i style="background:var(--egreso)"></i>Egresos</span>
  </div>
  <div id="g-meses"></div>

  <h2>Egresos por categoría</h2>
  <select id="g-sel-mes" class="mes"></select>
  <div id="g-categorias" style="margin-top:12px"></div>

  <h2>Una categoría en el tiempo</h2>
  <select id="g-sel-cat"></select>
  <div id="g-evolucion" style="margin-top:12px"></div>
</section>

<!-- ME DEBEN -->
<section id="s-deben" hidden>
  <h2>Plata prestada</h2>
  <div class="tarjeta" id="lista-deben"></div>
  <div class="pista" style="margin-top:12px">
    Para prestar, cargá un <b>Movimiento</b> desde tu cuenta hacia <b>Me deben</b> y poné el nombre.
    Cuando te devuelven, hacé el movimiento al revés: desde <b>Me deben</b> hacia la cuenta donde entró la plata.
  </div>
</section>

</div>

<nav>
  <button data-s="cargar" aria-selected="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><line x1="10" y1="6.5" x2="10" y2="13.5"/><line x1="6.5" y1="10" x2="13.5" y2="10"/></svg>Cargar</button>
  <button data-s="resumen" aria-selected="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="3" width="12" height="14" rx="2"/><line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="11" x2="13" y2="11"/><line x1="7" y1="14" x2="11" y2="14"/></svg>Resumen</button>
  <button data-s="graficos" aria-selected="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="2.5" y1="17" x2="17.5" y2="17"/><rect x="3.5" y="10.5" width="3.5" height="6.5" rx="1" style="fill:currentColor;stroke:none"/><rect x="8.25" y="6.5" width="3.5" height="10.5" rx="1" style="fill:currentColor;stroke:none"/><rect x="13" y="13" width="3.5" height="4" rx="1" style="fill:currentColor;stroke:none"/></svg>Gráficos</button>
  <button data-s="deben" aria-selected="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="7.5"/><polyline points="10,6.5 10,10 12.5,11.5"/></svg>Me deben</button>
  <button data-s="cuentas" aria-selected="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6.5" x2="17" y2="6.5"/><line x1="3" y1="13.5" x2="17" y2="13.5"/><circle cx="7" cy="6.5" r="2" style="fill:currentColor;stroke:none"/><circle cx="13" cy="13.5" r="2" style="fill:currentColor;stroke:none"/></svg>Ajustes</button>
</nav>

<script>
(function(){
"use strict";

var SYNC_BASE = '__SYNC_BASE__';

var CLAVE = "mis-cuentas-v1";
var CAT_EGRESO_DEF = ["Supermercado","Moto","Servicios","Salidas","Ropa","Salud","Vivienda","Suscripciones","Impuestos","Otros"];
var CAT_INGRESO_DEF = ["Sueldo DELPA","Contador","Otro"];
var ID_DEBEN = "me-deben";

var db = null;
var tipoActual = "Egreso";
var listaCatActual = "egreso";
var almacenaOk = true;

/* ---------- almacenamiento ---------- */
function nuevaDB(){
  return {
    cuentas:[{id:ID_DEBEN, nombre:"Me deben", moneda:"ARS", saldoInicial:0, fija:true}],
    movs:[],
    catEgreso:CAT_EGRESO_DEF.slice(),
    catIngreso:CAT_INGRESO_DEF.slice()
  };
}
function leerLocal(){
  try{
    var t = localStorage.getItem(CLAVE);
    return t ? JSON.parse(t) : null;
  }catch(e){ almacenaOk=false; return null; }
}
function guardar(){
  db.ts = Date.now();
  try{
    localStorage.setItem(CLAVE, JSON.stringify(db));
    marcarEstado("guardado");
  }catch(e){
    almacenaOk=false;
    marcarEstado("sin guardar");
  }
  if(SYNC_BASE){
    fetch(SYNC_BASE+'/api',{
      method:'PUT',
      body:JSON.stringify(db),
      headers:{'Content-Type':'application/json'}
    }).catch(function(){});
  }
}
function marcarEstado(txt){
  var e=document.getElementById("estado");
  if(!almacenaOk){ e.textContent="⚠ sin guardado automático"; return; }
  e.textContent = txt==="guardado" ? "guardado ✓" : txt;
  if(txt==="guardado") setTimeout(function(){ if(e.textContent==="guardado ✓") e.textContent=""; },1600);
}
function leerEmbebido(){
  try{
    var t=document.getElementById("datos-embebidos").textContent.trim();
    var d=JSON.parse(t);
    return (d && d.cuentas) ? d : null;
  }catch(e){ return null; }
}

/* ---------- utilidades ---------- */
function num(v){ var n=parseFloat(v); return isFinite(n)?n:0; }
function fmt(n, moneda){
  if(Math.abs(n)<0.005) n=0;
  var s = Math.abs(n).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2});
  return (n<0?"-":"") + (moneda==="USD"?"US$ ":"$ ") + s;
}
function cuenta(id){
  for(var i=0;i<db.cuentas.length;i++) if(db.cuentas[i].id===id) return db.cuentas[i];
  return null;
}
function monedaDe(id){ var c=cuenta(id); return c?c.moneda:"ARS"; }
function hoyISO(){
  var d=new Date(), m=d.getMonth()+1, dd=d.getDate();
  return d.getFullYear()+"-"+(m<10?"0":"")+m+"-"+(dd<10?"0":"")+dd;
}
function mesDe(f){ return f ? f.slice(0,7) : ""; }
function nombreMes(ym){
  var p=ym.split("-");
  var ms=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var i=parseInt(p[1],10)-1;
  return (ms[i]||"") + " " + p[0];
}
function esc(s){
  return String(s==null?"":s).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function id(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
var CAT_COLORES_MAP={'Supermercado':'#e8685a','Moto':'#fb923c','Servicios':'#60a5fa','Salidas':'#c084fc','Ropa':'#f472b6','Salud':'#4ade80','Vivienda':'#fb923c','Suscripciones':'#818cf8','Impuestos':'#fbbf24','Animales':'#86efac','Deporte':'#67e8f9','Sueldo DELPA':'#34c9a0','Contador':'#60a5fa'};
var CAT_PALETA=['#e8685a','#fb923c','#fbbf24','#4ade80','#34c9a0','#67e8f9','#60a5fa','#818cf8','#c084fc','#f472b6','#86efac','#94a3b8'];
function colorCat(cat){
  if(!cat) return '#94a3b8';
  if(CAT_COLORES_MAP[cat]) return CAT_COLORES_MAP[cat];
  var h=0; for(var i=0;i<cat.length;i++) h=(h*31+cat.charCodeAt(i))>>>0;
  return CAT_PALETA[h%CAT_PALETA.length];
}
function fmtAbrev(n,moneda){
  if(Math.abs(n)<0.005) n=0;
  var a=Math.abs(n),sig=n<0?'-':'',s;
  if(a>=1e6) s=sig+(a/1e6).toLocaleString('es-AR',{maximumFractionDigits:1})+' M';
  else if(a>=1e3) s=sig+Math.round(a/1e3)+' k';
  else s=sig+a.toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:0});
  return (moneda==='USD'?'US$ ':'$ ')+s;
}

/* ---------- saldos ---------- */
function saldo(idc){
  var c=cuenta(idc); if(!c) return 0;
  var s=num(c.saldoInicial);
  for(var i=0;i<db.movs.length;i++){
    var m=db.movs[i];
    if(m.tipo==="Ingreso" && m.destino===idc) s+=num(m.monto);
    else if(m.tipo==="Egreso" && m.origen===idc) s-=num(m.monto);
    else if(m.tipo==="Transferencia"){
      if(m.origen===idc) s-=num(m.monto);
      if(m.destino===idc) s+=num(m.montoDestino!=null?m.montoDestino:m.monto);
    }
  }
  return s;
}

/* ---------- render: tira de saldos ---------- */
function pintarTira(){
  var t=document.getElementById("tira");
  var nc=document.getElementById("neto-cabeza");
  var reales=db.cuentas;
  if(reales.length<=1 && db.movs.length===0 && saldo(ID_DEBEN)===0){
    t.innerHTML='<div class="vacio-tira">Creá tu primera cuenta en Ajustes.</div>';
    if(nc) nc.innerHTML='';
    return;
  }
  var totalARS=0, totalUSD=0, i, c, sv;
  for(i=0;i<reales.length;i++){
    c=reales[i];
    if(c.id===ID_DEBEN) continue;
    sv=saldo(c.id);
    if(c.moneda==='USD') totalUSD+=sv; else totalARS+=sv;
  }
  if(nc){
    var nh='<div class="neto-ars">'+esc(fmt(totalARS,'ARS'))+'</div>';
    if(totalUSD!==0) nh+='<div class="neto-usd">'+esc(fmt(totalUSD,'USD'))+'</div>';
    nc.innerHTML=nh;
  }
  var h="";
  for(i=0;i<reales.length;i++){
    c=reales[i]; sv=saldo(c.id);
    if(c.id===ID_DEBEN && sv===0 && db.cuentas.length>1) continue;
    var esUSD=c.moneda==='USD', esDebe=c.id===ID_DEBEN;
    h+='<div class="saldo'+(esDebe?' debe':(esUSD?' usd':''))+'" title="'+esc(fmt(sv,c.moneda))+'">'+
       '<div class="n">'+esc(c.nombre)+'</div>'+
       '<div class="v'+(sv<0?' neg':'')+'">'+esc(fmtAbrev(sv,c.moneda))+'</div></div>';
  }
  t.innerHTML=h;
}

/* ---------- render: formulario ---------- */
function opcionesCuentas(sel, incluirDeben, valor){
  var h="";
  for(var i=0;i<db.cuentas.length;i++){
    var c=db.cuentas[i];
    if(c.id===ID_DEBEN && !incluirDeben) continue;
    h+='<option value="'+esc(c.id)+'"'+(c.id===valor?' selected':'')+'>'+esc(c.nombre)+
       (c.moneda==="USD"?" (US$)":"")+'</option>';
  }
  sel.innerHTML=h;
}
function pintarFormulario(){
  var hayCuentas = db.cuentas.length>1;
  document.getElementById("sin-cuentas").hidden = hayCuentas;
  document.getElementById("formulario").hidden = !hayCuentas;
  if(!hayCuentas) return;

  var esT = tipoActual==="Transferencia";
  document.getElementById("bloque-cat").hidden = esT;
  document.getElementById("bloque-cuenta").hidden = esT;
  document.getElementById("bloque-transf").hidden = !esT;

  var cat=document.getElementById("f-cat");
  var lista = tipoActual==="Ingreso" ? db.catIngreso : db.catEgreso;
  var previo = cat.value, h="";
  for(var i=0;i<lista.length;i++)
    h+='<option'+(lista[i]===previo?' selected':'')+'>'+esc(lista[i])+'</option>';
  cat.innerHTML=h;

  document.getElementById("lbl-cuenta").textContent = tipoActual==="Ingreso" ? "Entra en" : "Sale de";
  opcionesCuentas(document.getElementById("f-cuenta"), false, document.getElementById("f-cuenta").value);
  opcionesCuentas(document.getElementById("f-origen"), true, document.getElementById("f-origen").value);
  opcionesCuentas(document.getElementById("f-destino"), true, document.getElementById("f-destino").value);

  actualizarTransf();
}
function actualizarTransf(){
  if(tipoActual!=="Transferencia") return;
  var o=document.getElementById("f-origen").value;
  var d=document.getElementById("f-destino").value;
  var distinta = monedaDe(o)!==monedaDe(d);
  document.getElementById("bloque-cambio").hidden = !distinta;
  document.getElementById("bloque-persona").hidden = !(o===ID_DEBEN || d===ID_DEBEN);
  document.getElementById("lbl-monto").textContent = distinta ? "Monto que sale" : "Monto";
  document.getElementById("lbl-dest").textContent =
    "Monto que entra (" + (monedaDe(d)==="USD"?"dólares":"pesos") + ")";
}

/* ---------- render: movimientos ---------- */
function pintarMovs(){
  var cont=document.getElementById("lista-movs");
  if(db.movs.length===0){
    cont.innerHTML='<div class="aviso">Todavía no cargaste nada. El primer movimiento va arriba.</div>';
    return;
  }
  var orden=db.movs.slice().sort(function(a,b){
    return a.fecha===b.fecha ? (b.creado||0)-(a.creado||0) : (a.fecha<b.fecha?1:-1);
  }).slice(0,40);

  var h="";
  for(var i=0;i<orden.length;i++){
    var m=orden[i], t1, t2, imp, dotColor;
    if(m.tipo==="Transferencia"){
      var co=cuenta(m.origen), cd=cuenta(m.destino);
      t1 = (m.persona? esc(m.persona)+" · " : "") + esc(co?co.nombre:"?")+" → "+esc(cd?cd.nombre:"?");
      var md = m.montoDestino!=null?m.montoDestino:m.monto;
      imp = esc(fmt(num(m.monto), monedaDe(m.origen)));
      if(m.montoDestino!=null && monedaDe(m.origen)!==monedaDe(m.destino)){
        var tc = num(md)!==0 ? num(m.monto)/num(md) : 0;
        imp += ' <span style="opacity:.6">→ '+esc(fmt(num(md),monedaDe(m.destino)))+'</span>';
        t2 = esc(m.fecha) + " · TC " + tc.toLocaleString("es-AR",{maximumFractionDigits:2});
      } else {
        t2 = esc(m.fecha);
      }
      if(m.desc) t2 += " · "+esc(m.desc);
      dotColor='var(--mueve)';
    } else {
      var cid = m.tipo==="Ingreso" ? m.destino : m.origen;
      var c = cuenta(cid);
      t1 = esc(m.categoria) + (m.desc? " · "+esc(m.desc) : "");
      t2 = esc(m.fecha) + " · " + esc(c?c.nombre:"?");
      imp = (m.tipo==="Ingreso"?"+":"−") + esc(fmt(num(m.monto), monedaDe(cid))).replace("-","");
      dotColor=colorCat(m.categoria);
    }
    h+='<div class="mov '+m.tipo+'"><div class="marca-t" style="background:'+dotColor+'"></div>'+
       '<div class="cuerpo"><div class="t1">'+t1+'</div><div class="t2">'+t2+'</div></div>'+
       '<div class="imp">'+imp+'</div>'+
       '<button class="borrar" data-borrar="'+esc(m.id)+'" aria-label="Borrar">×</button></div>';
  }
  cont.innerHTML=h;
}

/* ---------- render: cuentas ---------- */
function pintarCuentas(){
  var cont=document.getElementById("lista-cuentas");
  var h="";
  for(var i=0;i<db.cuentas.length;i++){
    var c=db.cuentas[i], s=saldo(c.id);
    var esUSD2=c.moneda==='USD', dotC2=esUSD2?'#7ec8e8':'var(--ingreso)';
    h+='<div class="mov"><div class="marca-t" style="background:'+dotC2+'"></div>'+
       '<div class="cuerpo">'+
       '<div class="t1">'+esc(c.nombre)+'</div>'+
       '<div class="t2">'+(c.moneda==="USD"?"Dólares":"Pesos")+' · inicial '+esc(fmt(num(c.saldoInicial),c.moneda))+'</div>'+
       '</div><div class="imp" style="font-weight:700'+(esUSD2?';color:#7ec8e8':'')+'">'+esc(fmt(s,c.moneda))+'</div>'+
       (c.fija?'<span style="width:14px"></span>':'<button class="borrar" data-borrar-cuenta="'+esc(c.id)+'" aria-label="Borrar">×</button>')+
       '</div>';
  }
  cont.innerHTML=h;
}

/* ---------- render: resumen ---------- */
function mesesConDatos(){
  var set={}, hoy=mesDe(hoyISO());
  set[hoy]=1;
  for(var i=0;i<db.movs.length;i++) set[mesDe(db.movs[i].fecha)]=1;
  var a=Object.keys(set).filter(Boolean).sort().reverse();
  return a;
}
function pintarSelectorMes(){
  var s=document.getElementById("sel-mes");
  var ms=mesesConDatos(), previo=s.value, h="";
  for(var i=0;i<ms.length;i++)
    h+='<option value="'+ms[i]+'">'+nombreMes(ms[i])+'</option>';
  s.innerHTML=h;
  if(previo && ms.indexOf(previo)>=0) s.value=previo;
}
function tablaMoneda(ym, moneda){
  var ing={}, egr={}, ti=0, te=0;
  for(var i=0;i<db.movs.length;i++){
    var m=db.movs[i];
    if(mesDe(m.fecha)!==ym) continue;
    if(m.tipo==="Ingreso" && monedaDe(m.destino)===moneda){
      ing[m.categoria]=(ing[m.categoria]||0)+num(m.monto); ti+=num(m.monto);
    } else if(m.tipo==="Egreso" && monedaDe(m.origen)===moneda){
      egr[m.categoria]=(egr[m.categoria]||0)+num(m.monto); te+=num(m.monto);
    }
  }
  if(ti===0 && te===0) return "";

  function filas(obj, lista){
    var orden=lista.slice(), k;
    for(k in obj) if(obj.hasOwnProperty(k) && orden.indexOf(k)<0) orden.push(k);
    var h="";
    for(var i=0;i<orden.length;i++){
      k=orden[i]; if(!obj[k]) continue;
      h+='<tr><td>'+esc(k)+'</td><td>'+esc(fmt(obj[k],moneda))+'</td></tr>';
    }
    return h;
  }
  var h='<h2>'+(moneda==="USD"?"Dólares":"Pesos")+'</h2><div class="tarjeta"><table>';
  h+='<tr><th>Ingresos</th><th>'+esc(fmt(ti,moneda))+'</th></tr>';
  h+=filas(ing, db.catIngreso);
  h+='<tr><th style="padding-top:14px">Egresos</th><th style="padding-top:14px">'+esc(fmt(te,moneda))+'</th></tr>';
  h+=filas(egr, db.catEgreso);
  h+='<tr class="neto"><td style="padding-top:12px">Neto del mes</td><td style="padding-top:12px;color:'+
     (ti-te>=0?'var(--ingreso)':'var(--egreso)')+'">'+esc(fmt(ti-te,moneda))+'</td></tr>';
  h+='</table></div>';
  return h;
}
function pintarResumen(){
  var ym=document.getElementById("sel-mes").value;
  var c=document.getElementById("cuerpo-resumen");
  if(!ym){ c.innerHTML=""; return; }
  var h = tablaMoneda(ym,"ARS") + tablaMoneda(ym,"USD");
  c.innerHTML = h || '<div class="aviso">No hay movimientos en '+esc(nombreMes(ym))+'.</div>';
}

/* ---------- render: me deben ---------- */
function pintarDeben(){
  var cont=document.getElementById("lista-deben");
  var gente={};
  for(var i=0;i<db.movs.length;i++){
    var m=db.movs[i];
    if(m.tipo!=="Transferencia") continue;
    var presta = (m.destino===ID_DEBEN), cobra = (m.origen===ID_DEBEN);
    if(!presta && !cobra) continue;
    var q = (m.persona||"Sin nombre").trim() || "Sin nombre";
    if(!gente[q]) gente[q]={pend:0, desde:m.fecha, ult:m.fecha};
    var monto = presta ? num(m.montoDestino!=null?m.montoDestino:m.monto) : num(m.monto);
    gente[q].pend += presta ? monto : -monto;
    if(m.fecha < gente[q].desde) gente[q].desde=m.fecha;
    if(m.fecha > gente[q].ult) gente[q].ult=m.fecha;
  }
  var nombres=Object.keys(gente);
  if(nombres.length===0){
    cont.innerHTML='<div class="aviso">No prestaste plata todavía. Cuando lo hagas, va a aparecer acá quién te debe y cuánto.</div>';
    return;
  }
  nombres.sort(function(a,b){ return gente[b].pend-gente[a].pend; });
  var total=0, h="";
  for(var j=0;j<nombres.length;j++){
    var g=gente[nombres[j]]; total+=g.pend;
    var saldada = Math.abs(g.pend)<0.005;
    h+='<div class="persona'+(saldada?' saldada':'')+'"><div><div class="t1" style="font-size:14.5px;font-weight:600">'+
       esc(nombres[j])+'</div><div class="d">'+(saldada?'saldado · último '+esc(g.ult):'desde '+esc(g.desde))+'</div></div>'+
       '<div class="m">'+(saldada?'—':esc(fmt(g.pend,"ARS")))+'</div></div>';
  }
  h+='<div class="persona" style="border-top:2px solid var(--tinta);border-bottom:0;margin-top:4px">'+
     '<div style="font-weight:700">Total pendiente</div><div class="m">'+esc(fmt(total,"ARS"))+'</div></div>';
  cont.innerHTML=h;
}

/* ---------- categorías ---------- */
function todasLasCategorias(){
  var l=db.catEgreso.concat(db.catIngreso), i;
  for(i=0;i<db.movs.length;i++){
    var c=db.movs[i].categoria;
    if(c && l.indexOf(c)<0) l.push(c);
  }
  return l;
}
function usosDe(cat){
  var n=0;
  for(var i=0;i<db.movs.length;i++) if(db.movs[i].categoria===cat) n++;
  return n;
}
function pintarCategorias(){
  var lista = listaCatActual==="egreso" ? db.catEgreso : db.catIngreso;
  var h="";
  for(var i=0;i<lista.length;i++){
    var u=usosDe(lista[i]);
    h+='<div class="chip"><div>'+esc(lista[i])+
       '<div class="uso">'+(u===0?"sin movimientos":u+(u===1?" movimiento":" movimientos"))+'</div></div>'+
       (u===0?'<button class="borrar" data-borrar-cat="'+esc(lista[i])+'" aria-label="Borrar">×</button>':'<span style="width:14px"></span>')+
       '</div>';
  }
  document.getElementById("lista-cats").innerHTML=h ||
    '<div class="aviso">No quedan categorías en esta lista.</div>';
}

/* ---------- gráficos ---------- */
function fmtCorto(n){
  var a=Math.abs(n);
  if(a>=1e6) return (n/1e6).toLocaleString("es-AR",{maximumFractionDigits:1})+" M";
  if(a>=1e3) return Math.round(n/1e3)+" k";
  return Math.round(n).toString();
}
function mesCorto(ym){
  var ms=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return ms[parseInt(ym.split("-")[1],10)-1] || ym;
}
function monedaDeMov(m){
  return m.tipo==="Ingreso" ? monedaDe(m.destino) : monedaDe(m.origen);
}
function monedasConDatos(){
  var r=[], i;
  for(i=0;i<db.movs.length;i++){
    if(db.movs[i].tipo==="Transferencia") continue;
    var mo=monedaDeMov(db.movs[i]);
    if(r.indexOf(mo)<0) r.push(mo);
  }
  return r.sort();
}
function marco(moneda, svg){
  if(!svg) return "";
  return '<div class="grafico"><div class="mon">'+(moneda==="USD"?"Dólares":"Pesos")+'</div>'+svg+'</div>';
}

function graficoMeses(moneda){
  var acum={}, i;
  for(i=0;i<db.movs.length;i++){
    var m=db.movs[i];
    if(m.tipo==="Transferencia" || monedaDeMov(m)!==moneda) continue;
    var k=mesDe(m.fecha);
    if(!acum[k]) acum[k]={ing:0,egr:0};
    if(m.tipo==="Ingreso") acum[k].ing+=num(m.monto); else acum[k].egr+=num(m.monto);
  }
  var ks=Object.keys(acum).sort().slice(-12);
  if(!ks.length) return "";
  var max=0;
  for(i=0;i<ks.length;i++) max=Math.max(max, acum[ks[i]].ing, acum[ks[i]].egr);
  if(max<=0) return "";

  var W=360,H=196,pT=18,pB=26,pL=4,pR=4;
  var ph=H-pT-pB, pw=W-pL-pR, gw=pw/ks.length, bw=Math.min(gw*0.30, 24);
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Ingresos y egresos por mes">';
  var niveles=[0,0.5,1];
  for(i=0;i<niveles.length;i++){
    var y=pT+ph-ph*niveles[i];
    s+='<line x1="'+pL+'" y1="'+y+'" x2="'+(W-pR)+'" y2="'+y+'" style="stroke:var(--linea)" stroke-width="1"/>';
    if(niveles[i]>0)
      s+='<text x="'+pL+'" y="'+(y-4)+'" font-size="9" style="fill:var(--tenue)">'+esc(fmtCorto(max*niveles[i]))+'</text>';
  }
  for(i=0;i<ks.length;i++){
    var d=acum[ks[i]], cx=pL+gw*i+gw/2;
    var hi=ph*(d.ing/max), he=ph*(d.egr/max);
    if(hi>0) s+='<rect x="'+(cx-bw-1).toFixed(1)+'" y="'+(pT+ph-hi).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+hi.toFixed(1)+'" fill="#34c9a0" rx="2"/>';
    if(he>0) s+='<rect x="'+(cx+1).toFixed(1)+'" y="'+(pT+ph-he).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+he.toFixed(1)+'" fill="#e8685a" rx="2"/>';
    if(ks.length<=8 || i%2===(ks.length-1)%2)
      s+='<text x="'+cx.toFixed(1)+'" y="'+(H-9)+'" font-size="9.5" text-anchor="middle" style="fill:var(--tenue)">'+esc(mesCorto(ks[i]))+'</text>';
  }
  return s+'</svg>';
}

function graficoCategorias(ym, moneda){
  var tot={}, i, k;
  for(i=0;i<db.movs.length;i++){
    var m=db.movs[i];
    if(m.tipo!=="Egreso" || mesDe(m.fecha)!==ym || monedaDeMov(m)!==moneda) continue;
    tot[m.categoria]=(tot[m.categoria]||0)+num(m.monto);
  }
  var ks=[];
  for(k in tot) if(tot.hasOwnProperty(k)) ks.push(k);
  if(!ks.length) return "";
  ks.sort(function(a,b){ return tot[b]-tot[a]; });
  var max=tot[ks[0]];
  if(max<=0) return "";

  var W=360, fh=24, H=ks.length*fh+4, labW=100, barMax=W-labW-52;
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Egresos por categoría">';
  for(i=0;i<ks.length;i++){
    var y=i*fh+2, w=Math.max(barMax*(tot[ks[i]]/max), 2);
    var etq = ks[i].length>15 ? ks[i].slice(0,14)+"…" : ks[i];
    s+='<text x="0" y="'+(y+13)+'" font-size="11" style="fill:var(--tinta)">'+esc(etq)+'</text>';
    s+='<rect x="'+labW+'" y="'+(y+3)+'" width="'+w.toFixed(1)+'" height="13" fill="'+colorCat(ks[i])+'" rx="2"/>';
    s+='<text x="'+(labW+w+5).toFixed(1)+'" y="'+(y+13.5)+'" font-size="9.5" style="fill:var(--tenue)">'+esc(fmtCorto(tot[ks[i]]))+'</text>';
  }
  return s+'</svg>';
}

function graficoEvolucion(cat, moneda){
  var acum={}, i, esIngreso = db.catIngreso.indexOf(cat)>=0;
  for(i=0;i<db.movs.length;i++){
    var m=db.movs[i];
    if(m.categoria!==cat || monedaDeMov(m)!==moneda) continue;
    var k=mesDe(m.fecha);
    acum[k]=(acum[k]||0)+num(m.monto);
  }
  var ks=Object.keys(acum).sort().slice(-12);
  if(!ks.length) return "";
  var max=0;
  for(i=0;i<ks.length;i++) max=Math.max(max, acum[ks[i]]);
  if(max<=0) return "";

  var W=360,H=170,pT=18,pB=26,pL=4,pR=4;
  var ph=H-pT-pB, pw=W-pL-pR, gw=pw/ks.length, bw=Math.min(gw*0.5, 34);
  var color = esIngreso ? "#34c9a0" : "#e8685a";
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Evolución de '+esc(cat)+'">';
  s+='<line x1="'+pL+'" y1="'+pT+'" x2="'+(W-pR)+'" y2="'+pT+'" style="stroke:var(--linea)"/>';
  s+='<text x="'+pL+'" y="'+(pT-5)+'" font-size="9" style="fill:var(--tenue)">'+esc(fmtCorto(max))+'</text>';
  s+='<line x1="'+pL+'" y1="'+(pT+ph)+'" x2="'+(W-pR)+'" y2="'+(pT+ph)+'" style="stroke:var(--linea)"/>';
  for(i=0;i<ks.length;i++){
    var cx=pL+gw*i+gw/2, h=ph*(acum[ks[i]]/max);
    s+='<rect x="'+(cx-bw/2).toFixed(1)+'" y="'+(pT+ph-h).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+color+'" rx="2"/>';
    if(ks.length<=8 || i%2===(ks.length-1)%2)
      s+='<text x="'+cx.toFixed(1)+'" y="'+(H-9)+'" font-size="9.5" text-anchor="middle" style="fill:var(--tenue)">'+esc(mesCorto(ks[i]))+'</text>';
  }
  return s+'</svg>';
}

function pintarGraficos(){
  var monedas=monedasConDatos(), i, h;

  h="";
  for(i=0;i<monedas.length;i++) h+=marco(monedas[i], graficoMeses(monedas[i]));
  document.getElementById("g-meses").innerHTML = h ||
    '<div class="aviso">Cargá algún ingreso o egreso y acá vas a ver la comparación mes a mes.</div>';

  var selM=document.getElementById("g-sel-mes"), ms=mesesConDatos(), previoM=selM.value;
  h="";
  for(i=0;i<ms.length;i++) h+='<option value="'+ms[i]+'">'+esc(nombreMes(ms[i]))+'</option>';
  selM.innerHTML=h;
  if(previoM && ms.indexOf(previoM)>=0) selM.value=previoM;

  var selC=document.getElementById("g-sel-cat"), cats=todasLasCategorias(), previoC=selC.value;
  h="";
  for(i=0;i<cats.length;i++) h+='<option>'+esc(cats[i])+'</option>';
  selC.innerHTML=h;
  if(previoC && cats.indexOf(previoC)>=0) selC.value=previoC;

  pintarGraficoCategorias();
  pintarGraficoEvolucion();
}
function pintarGraficoCategorias(){
  var ym=document.getElementById("g-sel-mes").value, monedas=monedasConDatos(), h="";
  for(var i=0;i<monedas.length;i++) h+=marco(monedas[i], graficoCategorias(ym, monedas[i]));
  document.getElementById("g-categorias").innerHTML = h ||
    '<div class="aviso">No hay egresos en ese mes.</div>';
}
function pintarGraficoEvolucion(){
  var cat=document.getElementById("g-sel-cat").value, monedas=monedasConDatos(), h="";
  for(var i=0;i<monedas.length;i++) h+=marco(monedas[i], graficoEvolucion(cat, monedas[i]));
  document.getElementById("g-evolucion").innerHTML = h ||
    '<div class="aviso">Todavía no hay movimientos en esa categoría.</div>';
}

function pintarTodo(){
  pintarTira(); pintarFormulario(); pintarMovs(); pintarCuentas(); pintarCategorias();
  pintarSelectorMes(); pintarResumen(); pintarGraficos(); pintarDeben();
}

/* ---------- acciones ---------- */
document.getElementById("seg-tipo").addEventListener("click", function(e){
  var b=e.target.closest("button"); if(!b) return;
  tipoActual=b.getAttribute("data-t");
  var bs=this.querySelectorAll("button");
  for(var i=0;i<bs.length;i++) bs[i].setAttribute("aria-pressed", bs[i]===b?"true":"false");
  pintarFormulario();
});

document.getElementById("f-origen").addEventListener("change", actualizarTransf);
document.getElementById("f-destino").addEventListener("change", actualizarTransf);

document.getElementById("guardar-mov").addEventListener("click", function(){
  var fecha=document.getElementById("f-fecha").value || hoyISO();
  var monto=num(document.getElementById("f-monto").value);
  if(monto<=0){ alert("Poné un monto mayor a cero."); return; }

  var m={ id:id(), creado:Date.now(), tipo:tipoActual, fecha:fecha, monto:monto,
          desc:document.getElementById("f-desc").value.trim() };

  if(tipoActual==="Transferencia"){
    var o=document.getElementById("f-origen").value;
    var d=document.getElementById("f-destino").value;
    if(o===d){ alert("Elegí dos cuentas distintas."); return; }
    m.origen=o; m.destino=d;
    if(monedaDe(o)!==monedaDe(d)){
      var md=num(document.getElementById("f-monto-dest").value);
      if(md<=0){ alert("Falta el monto que entra en la cuenta destino."); return; }
      m.montoDestino=md;
    }
    if(o===ID_DEBEN || d===ID_DEBEN){
      m.persona=document.getElementById("f-persona").value.trim();
      if(!m.persona){ alert("Poné el nombre de la persona."); return; }
    }
  } else {
    m.categoria=document.getElementById("f-cat").value;
    var cta=document.getElementById("f-cuenta").value;
    if(!cta){ alert("Elegí una cuenta."); return; }
    if(tipoActual==="Ingreso") m.destino=cta; else m.origen=cta;
  }

  db.movs.push(m);
  guardar();
  document.getElementById("f-monto").value="";
  document.getElementById("f-monto-dest").value="";
  document.getElementById("f-desc").value="";
  document.getElementById("f-persona").value="";
  pintarTodo();
  window.scrollTo({top:0, behavior:"smooth"});
});

document.getElementById("lista-movs").addEventListener("click", function(e){
  var b=e.target.closest("[data-borrar]"); if(!b) return;
  if(!confirm("¿Borrar este movimiento?")) return;
  var t=b.getAttribute("data-borrar");
  db.movs=db.movs.filter(function(m){ return m.id!==t; });
  guardar(); pintarTodo();
});

document.getElementById("guardar-cuenta").addEventListener("click", function(){
  var n=document.getElementById("c-nombre").value.trim();
  if(!n){ alert("Poné un nombre para la cuenta."); return; }
  db.cuentas.push({
    id:id(), nombre:n,
    moneda:document.getElementById("c-moneda").value,
    saldoInicial:num(document.getElementById("c-saldo").value)
  });
  guardar();
  document.getElementById("c-nombre").value="";
  document.getElementById("c-saldo").value="";
  pintarTodo();
});

document.getElementById("lista-cuentas").addEventListener("click", function(e){
  var b=e.target.closest("[data-borrar-cuenta]"); if(!b) return;
  var cid=b.getAttribute("data-borrar-cuenta");
  var usada=db.movs.some(function(m){ return m.origen===cid||m.destino===cid; });
  if(usada){ alert("Esta cuenta tiene movimientos cargados. Borralos primero si querés eliminarla."); return; }
  if(!confirm("¿Borrar esta cuenta?")) return;
  db.cuentas=db.cuentas.filter(function(c){ return c.id!==cid; });
  guardar(); pintarTodo();
});

document.getElementById("sel-mes").addEventListener("change", pintarResumen);
document.getElementById("g-sel-mes").addEventListener("change", pintarGraficoCategorias);
document.getElementById("g-sel-cat").addEventListener("change", pintarGraficoEvolucion);

document.getElementById("seg-cat").addEventListener("click", function(e){
  var b=e.target.closest("button"); if(!b) return;
  listaCatActual=b.getAttribute("data-l");
  var bs=this.querySelectorAll("button");
  for(var i=0;i<bs.length;i++) bs[i].setAttribute("aria-pressed", bs[i]===b?"true":"false");
  pintarCategorias();
});

document.getElementById("agregar-cat").addEventListener("click", function(){
  var campo=document.getElementById("cat-nombre");
  var n=campo.value.trim();
  if(!n){ alert("Escribí el nombre de la categoría."); return; }
  var todas=db.catEgreso.concat(db.catIngreso);
  for(var i=0;i<todas.length;i++){
    if(todas[i].toLowerCase()===n.toLowerCase()){ alert("Esa categoría ya existe."); return; }
  }
  (listaCatActual==="egreso" ? db.catEgreso : db.catIngreso).push(n);
  guardar(); campo.value=""; pintarTodo();
});

document.getElementById("lista-cats").addEventListener("click", function(e){
  var b=e.target.closest("[data-borrar-cat]"); if(!b) return;
  var c=b.getAttribute("data-borrar-cat");
  if(usosDe(c)>0){ alert("Esta categoría tiene movimientos cargados."); return; }
  if(!confirm("¿Borrar la categoría " + c + "?")) return;
  function sacar(l){ return l.filter(function(x){ return x!==c; }); }
  db.catEgreso=sacar(db.catEgreso); db.catIngreso=sacar(db.catIngreso);
  guardar(); pintarTodo();
});

/* ---------- exportar a Excel ---------- */
var CRC_T=(function(){var t=new Int32Array(256);
  for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c;}
  return t;})();
function crc32(b){var c=-1;for(var i=0;i<b.length;i++)c=CRC_T[(c^b[i])&0xFF]^(c>>>8);return (c^-1)>>>0;}
function bytes(s){return new TextEncoder().encode(s);}

function armarZip(archivos){
  var partes=[], central=[], off=0, i;
  for(i=0;i<archivos.length;i++){
    var f=archivos[i], nom=bytes(f.nombre), dat=f.datos, crc=crc32(dat), sz=dat.length;
    var lh=new Uint8Array(30+nom.length), v=new DataView(lh.buffer);
    v.setUint32(0,0x04034b50,true); v.setUint16(4,20,true); v.setUint16(6,0x0800,true);
    v.setUint16(8,0,true); v.setUint16(10,0,true); v.setUint16(12,0x21,true);
    v.setUint32(14,crc,true); v.setUint32(18,sz,true); v.setUint32(22,sz,true);
    v.setUint16(26,nom.length,true); v.setUint16(28,0,true);
    lh.set(nom,30);
    partes.push(lh); partes.push(dat);
    var cd=new Uint8Array(46+nom.length), w=new DataView(cd.buffer);
    w.setUint32(0,0x02014b50,true); w.setUint16(4,20,true); w.setUint16(6,20,true);
    w.setUint16(8,0x0800,true); w.setUint16(10,0,true); w.setUint16(12,0,true);
    w.setUint16(14,0x21,true); w.setUint32(16,crc,true); w.setUint32(20,sz,true);
    w.setUint32(24,sz,true); w.setUint16(28,nom.length,true); w.setUint32(42,off,true);
    cd.set(nom,46);
    central.push(cd);
    off += lh.length + sz;
  }
  var cdSize=0;
  for(i=0;i<central.length;i++) cdSize+=central[i].length;
  var fin=new Uint8Array(22), e=new DataView(fin.buffer);
  e.setUint32(0,0x06054b50,true); e.setUint16(8,archivos.length,true);
  e.setUint16(10,archivos.length,true); e.setUint32(12,cdSize,true); e.setUint32(16,off,true);
  var total=off+cdSize+22, out=new Uint8Array(total), p=0;
  for(i=0;i<partes.length;i++){ out.set(partes[i],p); p+=partes[i].length; }
  for(i=0;i<central.length;i++){ out.set(central[i],p); p+=central[i].length; }
  out.set(fin,p);
  return out;
}

function xmlEsc(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function colLetra(n){
  var s="";
  while(n>0){ var r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); }
  return s;
}
function hojaXml(filas){
  var x='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  for(var r=0;r<filas.length;r++){
    x+='<row r="'+(r+1)+'">';
    for(var c=0;c<filas[r].length;c++){
      var val=filas[r][c], ref=colLetra(c+1)+(r+1);
      if(val===null||val===undefined||val==="") continue;
      if(typeof val==="number" && isFinite(val))
        x+='<c r="'+ref+'"><v>'+val+'</v></c>';
      else
        x+='<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEsc(val)+'</t></is></c>';
    }
    x+='</row>';
  }
  return x+'</sheetData></worksheet>';
}
function armarXlsx(hojas){
  var ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  var wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '+
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
  var rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  var archivos=[], i;
  for(i=0;i<hojas.length;i++){
    var n=i+1;
    ct+='<Override PartName="/xl/worksheets/sheet'+n+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    wb+='<sheet name="'+xmlEsc(hojas[i].nombre)+'" sheetId="'+n+'" r:id="rId'+n+'"/>';
    rels+='<Relationship Id="rId'+n+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+n+'.xml"/>';
    archivos.push({nombre:"xl/worksheets/sheet"+n+".xml", datos:bytes(hojaXml(hojas[i].filas))});
  }
  ct+='</Types>';
  wb+='</sheets></workbook>';
  rels+='<Relationship Id="rId'+(hojas.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  var estilos='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'+
    '<fills count="2"><fill><patternFill patternType="none"/></fill>'+
    '<fill><patternFill patternType="gray125"/></fill></fills>'+
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'+
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'+
    '</styleSheet>';
  var raiz='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  return armarZip([
    {nombre:"[Content_Types].xml", datos:bytes(ct)},
    {nombre:"_rels/.rels", datos:bytes(raiz)},
    {nombre:"xl/workbook.xml", datos:bytes(wb)},
    {nombre:"xl/_rels/workbook.xml.rels", datos:bytes(rels)},
    {nombre:"xl/styles.xml", datos:bytes(estilos)}
  ].concat(archivos));
}

function datosParaExcel(){
  var i, m, hojas=[];

  var f=[["Fecha","Tipo","Categoría","Detalle","Sale de","Entra en","Moneda","Monto",
          "Monto que entra","Moneda destino","Tipo de cambio","Persona"]];
  var orden=db.movs.slice().sort(function(a,b){ return a.fecha<b.fecha?-1:(a.fecha>b.fecha?1:0); });
  for(i=0;i<orden.length;i++){
    m=orden[i];
    var co=cuenta(m.origen), cd=cuenta(m.destino);
    var mon = m.tipo==="Ingreso" ? monedaDe(m.destino) : monedaDe(m.origen);
    var md = (m.montoDestino!=null) ? num(m.montoDestino) : "";
    var tc = (md!=="" && md!==0) ? Math.round(num(m.monto)/md*100)/100 : "";
    f.push([m.fecha, m.tipo, m.categoria||"", m.desc||"",
            co?co.nombre:"", cd?cd.nombre:"", mon, num(m.monto),
            md, md!==""?monedaDe(m.destino):"", tc, m.persona||""]);
  }
  hojas.push({nombre:"Movimientos", filas:f});

  var g=[["Cuenta","Moneda","Saldo inicial","Saldo actual"]];
  for(i=0;i<db.cuentas.length;i++){
    var c=db.cuentas[i];
    g.push([c.nombre, c.moneda, num(c.saldoInicial), Math.round(saldo(c.id)*100)/100]);
  }
  hojas.push({nombre:"Cuentas", filas:g});

  var acum={};
  for(i=0;i<db.movs.length;i++){
    m=db.movs[i];
    if(m.tipo==="Transferencia") continue;
    var mo = m.tipo==="Ingreso" ? monedaDe(m.destino) : monedaDe(m.origen);
    var k = mesDe(m.fecha)+"|"+mo;
    if(!acum[k]) acum[k]={ing:0, egr:0};
    if(m.tipo==="Ingreso") acum[k].ing+=num(m.monto); else acum[k].egr+=num(m.monto);
  }
  var claves=Object.keys(acum).sort();
  var h=[["Mes","Moneda","Ingresos","Egresos","Neto"]];
  for(i=0;i<claves.length;i++){
    var p=claves[i].split("|"), a=acum[claves[i]];
    h.push([p[0], p[1], Math.round(a.ing*100)/100, Math.round(a.egr*100)/100,
            Math.round((a.ing-a.egr)*100)/100]);
  }
  hojas.push({nombre:"Resumen mensual", filas:h});

  var pc={};
  for(i=0;i<db.movs.length;i++){
    m=db.movs[i];
    if(m.tipo==="Transferencia") continue;
    var mc = m.tipo==="Ingreso" ? monedaDe(m.destino) : monedaDe(m.origen);
    var kk = mesDe(m.fecha)+"|"+mc+"|"+m.tipo+"|"+(m.categoria||"");
    pc[kk]=(pc[kk]||0)+num(m.monto);
  }
  var ck=Object.keys(pc).sort();
  var j=[["Mes","Moneda","Tipo","Categoría","Monto"]];
  for(i=0;i<ck.length;i++){
    var q=ck[i].split("|");
    j.push([q[0], q[1], q[2], q[3], Math.round(pc[ck[i]]*100)/100]);
  }
  hojas.push({nombre:"Por categoría", filas:j});

  return hojas;
}

document.getElementById("exportar-xls").addEventListener("click", function(){
  try{
    var datos=armarXlsx(datosParaExcel());
    var blob=new Blob([datos],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="mis-cuentas-"+hoyISO()+".xlsx";
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },2000);
  }catch(err){ alert("No se pudo armar el Excel en este navegador."); }
});

document.getElementById("exportar").addEventListener("click", function(){
  var blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="mis-cuentas-"+hoyISO()+".json";
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); },2000);
});
document.getElementById("importar").addEventListener("click", function(){
  document.getElementById("archivo").click();
});
document.getElementById("archivo").addEventListener("change", function(e){
  var f=e.target.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(){
    try{
      var d=JSON.parse(r.result);
      if(!d.cuentas||!d.movs) throw 0;
      if(!confirm("Esto reemplaza todo lo que tenés cargado ahora. ¿Seguir?")) return;
      db=d; guardar(); pintarTodo();
    }catch(err){ alert("Ese archivo no tiene el formato esperado."); }
  };
  r.readAsText(f);
  e.target.value="";
});

document.querySelector("nav").addEventListener("click", function(e){
  var b=e.target.closest("button"); if(!b) return;
  var s=b.getAttribute("data-s");
  var bs=this.querySelectorAll("button");
  for(var i=0;i<bs.length;i++) bs[i].setAttribute("aria-selected", bs[i]===b?"true":"false");
  var secs=["cargar","cuentas","resumen","graficos","deben"];
  for(var j=0;j<secs.length;j++)
    document.getElementById("s-"+secs[j]).hidden = (secs[j]!==s);
  window.scrollTo(0,0);
});

/* ---------- sync ---------- */
function sincronizar(){
  if(!SYNC_BASE) return;
  fetch(SYNC_BASE+'/api',{cache:'no-store'})
    .then(function(r){ return r.json(); })
    .then(function(rem){
      if(!rem||!rem.cuentas) return;
      if(!db.ts||(rem.ts&&rem.ts>db.ts)){
        db=rem;
        if(!db.cuentas.some(function(c){ return c.id===ID_DEBEN; }))
          db.cuentas.unshift({id:ID_DEBEN,nombre:"Me deben",moneda:"ARS",saldoInicial:0,fija:true});
        if(!Array.isArray(db.catEgreso)||!db.catEgreso.length) db.catEgreso=CAT_EGRESO_DEF.slice();
        if(!Array.isArray(db.catIngreso)||!db.catIngreso.length) db.catIngreso=CAT_INGRESO_DEF.slice();
        try{ localStorage.setItem(CLAVE,JSON.stringify(db)); }catch(ex){}
        pintarTodo();
      }
    })
    .catch(function(){});
}

/* ---------- arranque ---------- */
var local=leerLocal(), emb=leerEmbebido();
db = local || emb || nuevaDB();
if(!db.cuentas.some(function(c){ return c.id===ID_DEBEN; }))
  db.cuentas.unshift({id:ID_DEBEN, nombre:"Me deben", moneda:"ARS", saldoInicial:0, fija:true});
if(!Array.isArray(db.catEgreso) || !db.catEgreso.length) db.catEgreso=CAT_EGRESO_DEF.slice();
if(!Array.isArray(db.catIngreso) || !db.catIngreso.length) db.catIngreso=CAT_INGRESO_DEF.slice();
document.getElementById("f-fecha").value = hoyISO();
pintarTodo();
if(!almacenaOk || !window.localStorage){
  almacenaOk=false;
  marcarEstado("");
  var w=document.createElement("div");
  w.className="banner";
  w.innerHTML="Este navegador no está guardando los datos. Descargá el archivo y abrilo desde tu celular o computadora para que el guardado automático funcione.";
  document.getElementById("s-cargar").prepend(w);
}

sincronizar();
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState==='visible') sincronizar();
});
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(function(){});
}

})();
</script>
`;

// ─── WORKER ──────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Service worker (scope raíz para que cubra todos los tokens)
    if (path === '/sw.js') {
      return new Response(SW_CODE, {
        headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' }
      });
    }

    // Sin token → mensaje de error amigable
    if (!parts.length) {
      return new Response('Ingresá con tu URL secreta.', {
        status: 200,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
    }

    const token = parts[0];

    // Manifest PWA: /TOKEN/manifest.json
    if (parts[1] === 'manifest.json') {
      const manifest = MANIFEST_TPL.replace(/__TOKEN__/g, token);
      return new Response(manifest, {
        headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }
      });
    }

    // API sync: GET /TOKEN/api  →  leer datos
    //           PUT /TOKEN/api  →  guardar datos
    if (parts[1] === 'api') {
      if (request.method === 'GET') {
        const data = await env.DATA.get(token);
        return new Response(data || 'null', {
          headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
      if (request.method === 'PUT') {
        const body = await request.text();
        try { JSON.parse(body); } catch (e) {
          return new Response('JSON inválido', { status: 400, headers: CORS });
        }
        await env.DATA.put(token, body);
        return new Response('ok', { headers: CORS });
      }
      return new Response('Método no soportado', { status: 405 });
    }

    // App: cualquier otra ruta bajo /TOKEN → servir HTML con token inyectado
    const html = HTML
      .replace(/__SYNC_BASE__/g, '/' + token)
      .replace(/__MANIFEST_URL__/g, '/' + token + '/manifest.json');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-cache' }
    });
  }
};

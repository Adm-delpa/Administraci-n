// Menú lateral + barra superior compartidos por las pantallas de sección del pilar Gente.
// Uso: en la página poner
//   <div class="gs-layout"><aside class="gs-sidebar" id="gs-sidebar"></aside>
//   <div class="gs-backdrop" onclick="GenteShell.cerrar()"></div>
//   <div class="gs-app"><header class="gs-topbar" id="gs-topbar"></header> ...contenido... </div></div>
// y llamar GenteShell.init({ activo: pagina => bool, titulo: 'Nombre de la sección' }).
// Devuelve una promesa con /api/paginas (para no pedirlo dos veces).
(function(){
  const ICONOS = [
    ['cultura','ti-building-community'],['reclutamiento','ti-user-search'],['recompensas','ti-award'],
    ['aprendizaje','ti-school'],['ambiente','ti-building'],['talento','ti-trending-up'],
    ['comite','ti-users-group'],['comité','ti-users-group'],['galaxia','ti-planet'],['pda','ti-checklist']
  ];
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const icono = t => { const l = String(t||'').toLowerCase(); for(const [k,i] of ICONOS){ if(l.includes(k)) return i; } return 'ti-folder'; };
  const numero = t => { const m = String(t||'').match(/^(\d+)\./); return m ? m[1] : ''; };
  const limpio = t => String(t||'').replace(/^\d+\.\s*/,'');
  // Corrige tildes que faltan en títulos cargados en la base
  const acentos = t => String(t||'').replace(/\bSeleccion\b/g,'Selección').replace(/\bDescripcion\b/g,'Descripción').replace(/\bComite\b/g,'Comité');

  function urlSeccion(p){
    const b = p.bloques || [];
    if(b.length === 1 && b[0].tipo === 'embed'){
      const u = (b[0].data && b[0].data.url) || '';
      if(u.startsWith('/') && u.length > 1) return u;
    }
    if(limpio(p.titulo) === 'Talento y Crecimiento') return '/talento-hub';
    return '/pilar-gente?seccion=' + p.id;
  }

  function puedeVer(user, p){
    if(user.admin) return true;
    return (user.modulos || []).includes('p_' + p.id);
  }

  async function init(opts){
    opts = opts || {};
    const user = JSON.parse(sessionStorage.getItem('user') || 'null');
    if(!user){ window.location.href = '/'; return []; }
    const nombre = user.nombre || user.username || '';
    const ini = String(nombre).trim().split(/\s+/).map(w => w[0] || '').join('').slice(0,2).toUpperCase();

    document.getElementById('gs-topbar').innerHTML =
      '<button class="gs-menu" onclick="document.body.classList.toggle(\'gs-open\')" aria-label="Abrir menú"><i class="ti ti-menu-2" aria-hidden="true"></i></button>'
      + '<nav class="gs-crumb"><a href="/pilar-gente">Inicio</a><span>›</span><span>' + esc(opts.titulo || '') + '</span></nav>'
      + '<div class="gs-spacer"></div>'
      + '<span class="gs-user"><span class="gs-avatar">' + esc(ini) + '</span><span class="gs-username">' + esc(nombre) + '</span></span>'
      + '<button class="gs-logout" onclick="if(confirm(\'¿Cerrar sesión?\')){sessionStorage.clear();window.location.href=\'/\'}">Salir</button>';

    const side = document.getElementById('gs-sidebar');
    const marco = navHtml => side.innerHTML =
      '<a class="gs-brand" href="/pilar-gente"><span class="gs-logo"><img src="/logo.png" alt="Logo"></span>'
      + '<span><span class="gs-empresa" style="display:block">Del Palacio S.A.</span><span class="gs-area">Gente</span></span></a>'
      + '<nav class="gs-nav"><a class="gs-item" href="/pilar-gente"><i class="ti ti-home" aria-hidden="true"></i>Inicio</a>'
      + '<div class="gs-label">Secciones</div>' + navHtml + '</nav>';
    marco('');

    let paginas = [];
    try { paginas = await fetch('/api/paginas').then(r => r.json()); } catch(e) {}
    const raices = paginas.filter(p => !p.parent_id).sort((a,b) => (a.orden||0) - (b.orden||0));
    marco(raices.map(p => {
      const n = numero(p.titulo), t = acentos(limpio(p.titulo));
      const inner = '<i class="ti ' + icono(p.titulo) + '" aria-hidden="true"></i>' + (n ? '<span class="gs-num">' + n + '</span>' : '') + '<span>' + esc(t) + '</span>';
      if(!puedeVer(user, p)) return '<span class="gs-item locked" title="Sin acceso">' + inner + '<i class="ti ti-lock gs-lock" aria-hidden="true"></i></span>';
      const activo = opts.activo && opts.activo(p);
      return '<a class="gs-item' + (activo ? ' active' : '') + '" href="' + esc(urlSeccion(p)) + '">' + inner + '</a>';
    }).join(''));
    return paginas;
  }

  window.GenteShell = { init, cerrar: () => document.body.classList.remove('gs-open'), acentos };
})();

// Helpers para armar el contenido de los hubs con el estilo estándar
(function(){
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // f = { href, icon, nombre, desc, estado, cls }
  function fila(f){
    return '<a class="hub-fila" href="' + esc(f.href) + '">'
      + '<span class="hub-fila-icon"><i class="ti ' + f.icon + '" aria-hidden="true"></i></span>'
      + '<span><span class="hub-fila-nombre">' + esc(f.nombre) + '</span>'
      + (f.desc ? '<span class="hub-fila-desc">' + esc(f.desc) + '</span>' : '') + '</span>'
      + '<span class="hub-fila-estado ' + (f.cls || '') + '">' + esc(f.estado || '') + '</span>'
      + '<i class="ti ti-chevron-right hub-fila-arrow" aria-hidden="true"></i></a>';
  }
  function grupo(titulo, filas){
    return filas.length ? '<div class="hub-grupo">' + esc(titulo) + '</div><div class="hub-lista">' + filas.map(fila).join('') + '</div>' : '';
  }
  // k = { href, icon, label, valor, sub } (valor/sub pueden traer HTML ya escapado)
  function kpi(k){
    const tag = k.href ? 'a' : 'div';
    return '<' + tag + ' class="hub-kpi"' + (k.href ? ' href="' + esc(k.href) + '"' : '') + '>'
      + '<div class="hub-kpi-label"><i class="ti ' + k.icon + '" aria-hidden="true"></i>' + esc(k.label) + '</div>'
      + '<div class="hub-kpi-valor"' + (k.chico ? ' style="font-size:17px;padding-top:4px"' : '') + '>' + k.valor + '</div>'
      + '<div class="hub-kpi-sub">' + (k.sub || '&nbsp;') + '</div></' + tag + '>';
  }
  GenteShell.hub = { fila, grupo, kpi, esc };
})();

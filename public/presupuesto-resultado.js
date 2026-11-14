/* Presupuesto — cargas manuales del mes (WSC, Cuenta y Orden, notas de crédito CMQ,
 * ICV y segmentación del canal refrigerado) y su reparto entre sucursales, igual que
 * la hoja Volumen / WSC / CyO del Excel. Más adelante, el estado de resultados.
 * Funciona en el navegador (window.PresupuestoResultado) y en Node.
 */
(function (root) {
  'use strict';

  // Campos que se cargan a mano cada mes. reparto: vol | fn | cc
  const SECCIONES = [
    {
      id: 'wsc', titulo: 'WSC', ayuda: 'Reconocimientos de la compañía, por tipo.', reparto: 'vol',
      campos: [
        { id: 'rama', label: 'Rama (R - Base)' },
        { id: 'sutiaga', label: 'Sutiaga (S - Base)' },
        { id: 'bdr', label: 'BDR Área Sur' },
        { id: 'nabs', label: 'Líderes NABS' },
      ],
    },
    {
      id: 'cyo', titulo: 'Cuenta y Orden', ayuda: 'Pallets reales entregados por unidad de negocio × reconocimiento de flete por pallet. Va todo a Casa Central.', reparto: 'cc',
      campos: [
        { id: 'palAguas', label: 'Pallets Aguas Eco', pallets: true },
        { id: 'palAbove', label: 'Pallets Cervezas Above Core', pallets: true },
        { id: 'palCore', label: 'Pallets Cervezas Core + Value', pallets: true },
        { id: 'palMkt', label: 'Pallets Marketplace Alimentos', pallets: true },
        { id: 'palRestoUng', label: 'Pallets Resto UNG', pallets: true },
        { id: 'palTopUng', label: 'Pallets Top UNG', pallets: true },
        { id: 'palVino', label: 'Pallets Vino y adyacencias', pallets: true },
        { id: 'recPallet', label: 'Reconocimiento por pallet ($)' },
      ],
    },
    { id: 'ndcExtra', titulo: 'NDC CMQ extra margen', ayuda: 'Total del mes. Se reparte por facturación neta.', reparto: 'fn', campos: [{ id: 'total', label: 'Total' }] },
    { id: 'ndcOtras', titulo: 'Otras NDC CMQ', ayuda: 'Total del mes. Se reparte por facturación neta.', reparto: 'fn', campos: [{ id: 'total', label: 'Total' }] },
    { id: 'icv', titulo: 'ICV', ayuda: 'Incentivos cobrados. Total del mes; se reparte por volumen.', reparto: 'vol', campos: [{ id: 'total', label: 'Total' }] },
    { id: 'segm', titulo: 'Segmentación canal refrigerado', ayuda: 'Lo que la compañía descuenta por segmentación del canal refrigerado. Total del mes; se reparte por facturación neta.', reparto: 'fn', campos: [{ id: 'total', label: 'Total' }] },
  ];

  const num = v => (v === '' || v == null || !isFinite(+v)) ? null : +v;
  const share = k => {
    if (!k) return null;
    const cc = +k.CC || 0, dol = +k.DOL || 0;
    return cc + dol > 0 ? cc / (cc + dol) : null;
  };

  // cargas: { wsc:{rama,...}, cyo:{...}, ndcExtra:{total}, ... } (valores numéricos; vacío = no cargado)
  // claves: { vol:{CC,DOL}, fn:{CC,DOL} } (de los reportes CMQ)
  // Devuelve { secciones:[{id, titulo, total, CC, DOL, faltan:[labels], sinClave}], faltan:[...] }
  function calcularCargas(cargas, claves) {
    const out = [];
    const faltanGlobal = [];
    SECCIONES.forEach(s => {
      const v = (cargas && cargas[s.id]) || {};
      const faltan = s.campos.filter(c => num(v[c.id]) == null).map(c => c.label);
      let total = 0;
      if (s.id === 'cyo') {
        const pallets = s.campos.filter(c => c.pallets).reduce((a, c) => a + (num(v[c.id]) || 0), 0);
        total = pallets * (num(v.recPallet) || 0);
      } else {
        total = s.campos.reduce((a, c) => a + (num(v[c.id]) || 0), 0);
      }
      const o = { id: s.id, titulo: s.titulo, total, CC: 0, DOL: 0, faltan };
      if (s.reparto === 'cc') o.CC = total;
      else {
        const sh = share(claves && claves[s.reparto]);
        if (sh == null) { o.sinClave = s.reparto; if (total) faltanGlobal.push(s.reparto === 'vol' ? 'Volumen del mes (reportes CMQ)' : 'Facturación neta del mes (reportes CMQ)'); }
        else { o.CC = total * sh; o.DOL = total * (1 - sh); }
      }
      if (faltan.length) faltanGlobal.push(s.titulo);
      out.push(o);
    });
    return { secciones: out, faltan: [...new Set(faltanGlobal)] };
  }

  // ── Estado de resultados (hoja RESULTADOS) ──
  const GRUPOS = ['CERVEZAS ABOVE CORE', 'CERVEZAS CORE + VALUE', 'UNG PREMIUM', 'UNG SIN PREMIUM', 'AGUAS', 'VINOS Y ADY', 'MARKETPLACE ALIMENTOS'];
  const AREAS = [
    ['VENTAS', 'Ventas'], ['OPERACIONES', 'Operaciones'], ['INFRAESTRUCTURA', 'Infraestructura'],
    ['DISTRIBUCION', 'Distribución'], ['ACARREO', 'Acarreo'], ['ADMIN Y FINANZAS', 'Administración y finanzas'],
  ];
  // Percepciones IIBB: 5% sobre (bruta − bonificaciones), con coeficiente 1,16 en cerveza y 1,06 en UNG
  const IIBB = { tasa: 0.05, coef: [1.16, 1.16, 1.06, 1.06, 1, 1, 1] };
  const z7 = () => [0, 0, 0, 0, 0, 0, 0];
  const S = a => a.reduce((x, y) => x + (+y || 0), 0);

  // vol: bloques del Nivel 1 { volCC[7], volDOL[7], phl[7], tshl[14] (CMQ 7 + DP 7), cmv[14] (CC 7 + DOL 7), fn[2] }
  // egresos: resultado de PresupuestoEgresos.repartir() (con .areas) o null
  // cargas: resultado de calcularCargas() o null
  // Devuelve { lineas: [{id, label, nivel, T, CC, DOL, sub?:[...]}], faltan: [...] }
  function resultadoMes(vol, egresos, cargas) {
    const faltan = [];
    const L = [];
    const suc = ['CC', 'DOL'];
    const linea = (id, label, CC, DOL, extra) => { const o = { id, label, CC, DOL, T: CC + DOL, ...(extra || {}) }; L.push(o); return o; };
    const porGrupo = f => { // f(suc, i) -> valor; devuelve {CC,DOL,sub}
      const sub = GRUPOS.map((g, i) => ({ label: g, CC: f('CC', i), DOL: f('DOL', i) }));
      sub.forEach(s => { s.T = s.CC + s.DOL; });
      return { CC: S(sub.map(s => s.CC)), DOL: S(sub.map(s => s.DOL)), sub };
    };

    if (!vol) faltan.push('Reportes CMQ del mes (volumen, facturación, CMV)');
    const v = vol || {};
    const volS = { CC: v.volCC || z7(), DOL: v.volDOL || z7() };
    const phl = v.phl || z7(), tsC = (v.tshl || []).slice(0, 7), tsD = (v.tshl || []).slice(7, 14);
    const cmv = { CC: (v.cmv || []).slice(0, 7), DOL: (v.cmv || []).slice(7, 14) };

    const vV = porGrupo((s, i) => +volS[s][i] || 0);
    linea('vol', 'Volumen (HL)', vV.CC, vV.DOL, { sub: vV.sub, hl: true });
    const fb = porGrupo((s, i) => (+phl[i] || 0) * (+volS[s][i] || 0));
    linea('fb', 'Facturación bruta', fb.CC, fb.DOL, { sub: fb.sub });
    const bDP = porGrupo((s, i) => (+tsD[i] || 0) * (+volS[s][i] || 0));
    linea('bonDP', 'Bonificaciones a cargo de Del Palacio', bDP.CC, bDP.DOL, { sub: bDP.sub, info: true });
    const bCMQ = porGrupo((s, i) => (+tsC[i] || 0) * (+volS[s][i] || 0));
    linea('bonCMQ', 'Bonificaciones a cargo de CMQ', bCMQ.CC, bCMQ.DOL, { sub: bCMQ.sub });
    const cm = porGrupo((s, i) => +cmv[s][i] || 0);
    linea('cmv', 'CMV', cm.CC, cm.DOL, { sub: cm.sub });

    const c = id => { const x = cargas && cargas.secciones.find(s => s.id === id); return x || { CC: 0, DOL: 0, faltan: ['sin cargar'] }; };
    if (!cargas) faltan.push('Cargas del mes');
    else if (cargas.faltan.length) faltan.push('Cargas del mes: ' + cargas.faltan.join(', '));
    const ndc = c('ndcExtra'), otras = c('ndcOtras'), icv = c('icv'), wsc = c('wsc'), cyo = c('cyo'), seg = c('segm');
    const fc = x => (x.faltan && x.faltan.length) ? { faltaCarga: true } : {};
    linea('ndcExtra', 'NDC CMQ extra margen', ndc.CC, ndc.DOL, fc(ndc));
    linea('ndcOtras', 'Otras NDC CMQ', otras.CC, otras.DOL, fc(otras));
    linea('icv', 'ICV', icv.CC, icv.DOL, fc(icv));
    const fn = { CC: +(v.fn || [])[0] || 0, DOL: +(v.fn || [])[1] || 0 };
    linea('fn', 'Facturación neta', fn.CC, fn.DOL, { base: true });
    linea('wsc', 'WSC', wsc.CC, wsc.DOL, fc(wsc));
    linea('cyo', 'Facturación remota (Cuenta y Orden)', cyo.CC, cyo.DOL, fc(cyo));
    linea('segm', 'Segmentación canal refrigerado', seg.CC, seg.DOL, fc(seg));

    const mo = s => fn[s] - cm[s] + bCMQ[s] + icv[s] + ndc[s] + otras[s] - seg[s];
    linea('mo', 'MARGEN OPERATIVO', mo('CC'), mo('DOL'), { total: true, formula: 'Fact. neta − CMV + Bonif. CMQ + ICV + NDC extra margen + Otras NDC − Segmentación' });
    const mb = s => mo(s) + wsc[s] + cyo[s];
    linea('mb', 'MARGEN BRUTO', mb('CC'), mb('DOL'), { total: true, formula: 'Margen operativo + WSC + Facturación remota' });

    if (!egresos) faltan.push('Egresos del mes (exports de Chess)');
    else if (egresos.faltanClaves && egresos.faltanClaves.length) faltan.push('Egresos: faltan ' + egresos.faltanClaves.length + ' datos (ver pestaña Egresos)');
    const areas = AREAS.map(([id, label]) => {
      const a = egresos && egresos.areas.find(x => x.area === id);
      return { label, CC: a ? a.CC : 0, DOL: a ? a.DOL : 0, T: a ? a.total : 0 };
    });
    const sinRep = egresos ? (egresos.sinRepartir || 0) : 0;
    const gCC = S(areas.map(a => a.CC)), gDOL = S(areas.map(a => a.DOL));
    const gT = S(areas.map(a => a.T));
    const g = linea('gastos', 'GASTOS OPERATIVOS', gCC, gDOL, { sub: areas, total: true });
    g.T = gT; // incluye lo que todavía no se pudo repartir entre sucursales
    if (sinRep > 0.5) g.sinRepartir = sinRep;

    const ebitda = linea('ebitda', 'EBITDA', mb('CC') - gCC, mb('DOL') - gDOL, { total: true });
    ebitda.T = mb('CC') + mb('DOL') - gT;
    const iibb = s => IIBB.tasa * fb.sub.reduce((a, x, i) => a + ((x[s] - bCMQ.sub[i][s] - bDP.sub[i][s]) * IIBB.coef[i]), 0);
    linea('iibb', 'Percepciones Ingresos Brutos', iibb('CC'), iibb('DOL'), { formula: '5% de (bruta − bonificaciones), × 1,16 cerveza y × 1,06 UNG' });
    const un = linea('un', 'UTILIDAD NETA', ebitda.CC - iibb('CC'), ebitda.DOL - iibb('DOL'), { total: true, final: true });
    un.T = ebitda.T - iibb('CC') - iibb('DOL');
    return { lineas: L, faltan, fn };
  }

  const api = { SECCIONES, calcularCargas, GRUPOS, AREAS, resultadoMes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PresupuestoResultado = api;
})(typeof window !== 'undefined' ? window : this);

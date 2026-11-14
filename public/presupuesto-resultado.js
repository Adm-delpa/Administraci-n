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

  // ── Presupuesto (Nivel 3) ──
  // Lee el presupuesto del Excel "PRESUPUESTO DP" (valores ya calculados en las celdas).
  // getCell(hoja, 'C12') -> número. Devuelve { '2026/01': p, ... }
  const COLS_MES = 'CDEFGHIJKLMN'.split('');
  const colN = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const colL = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  function leerPresupuesto(getCell, anio) {
    const meses = {};
    const filas = (h, col, a, b) => { const o = []; for (let r = a; r <= b; r++) o.push(+getCell(h, col + r) || 0); return o; };
    const AREA_FILA = [['VENTAS', 17], ['OPERACIONES', 37], ['INFRAESTRUCTURA', 50], ['DISTRIBUCION', 65], ['ACARREO', 71], ['ADMIN Y FINANZAS', 127]];
    COLS_MES.forEach((c, i) => {
      const cCC = colL(colN('P') + i), cDOL = colL(colN('AC') + i), cW = colL(colN('B') + i), cY = colL(colN('O') + i);
      const n = (h, a) => +getCell(h, a) || 0;
      meses[anio + '/' + String(i + 1).padStart(2, '0')] = {
        volCC: filas('Volumen', c, 12, 18), volDOL: filas('Volumen', c, 20, 26),
        phl: filas('Volumen', c, 30, 36), margen: filas('Volumen', c, 39, 45),
        tsCMQ: filas('Volumen', c, 129, 135), tsDP: filas('Volumen', c, 136, 142),
        icv: { CC: n('Volumen', c + 100), DOL: n('Volumen', c + 101) },
        ndc: { CC: n('Volumen', c + 175), DOL: n('Volumen', c + 176) },
        otras: { CC: n('Volumen', c + 180), DOL: n('Volumen', c + 181) },
        wsc: { CC: n('WSC', cW + 7), DOL: n('WSC', cW + 8) },
        cyo: { CC: n('CyO', cY + 13), DOL: 0 },
        segm: { CC: 0, DOL: 0 },
        gastos: AREA_FILA.map(([area, f]) => ({ area, total: n('PRESUPUESTO', c + f), CC: n('PRESUPUESTO', cCC + f), DOL: n('PRESUPUESTO', cDOL + f) })),
        // Gastos por renglón (misma estructura de filas que la hoja REAL); solo los que tienen importe
        renglones: (() => {
          const tot = new Set(AREA_FILA.map(x => x[1])); const o = [];
          for (let f = 4; f <= 126; f++) {
            if (tot.has(f)) continue;
            const t = n('PRESUPUESTO', c + f), cc = n('PRESUPUESTO', cCC + f), dl = n('PRESUPUESTO', cDOL + f);
            if (t || cc || dl) o.push({ fila: f, total: t, CC: cc, DOL: dl });
          }
          return o;
        })(),
      };
    });
    return meses;
  }

  // Arma el resultado presupuestado con el mismo motor que el real.
  // Diferencias del Excel: CMV = bruta / (1 + margen del segmento); Fact. neta = bruta − bonificaciones.
  function presupuestoMes(p) {
    const suc = ['CC', 'DOL'];
    const fb = {}, cmv = {}, fn = {};
    suc.forEach(s => {
      const vol = s === 'CC' ? p.volCC : p.volDOL;
      fb[s] = vol.map((v, i) => v * p.phl[i]);
      cmv[s] = fb[s].map((x, i) => x / (1 + (p.margen[i] || 0)));
      fn[s] = S(fb[s]) - S(vol.map((v, i) => v * p.tsDP[i])) - S(vol.map((v, i) => v * p.tsCMQ[i]));
    });
    const vol = { volCC: p.volCC, volDOL: p.volDOL, phl: p.phl, tshl: p.tsCMQ.concat(p.tsDP), cmv: cmv.CC.concat(cmv.DOL), fn: [fn.CC, fn.DOL] };
    const sec = (id, o) => ({ id, CC: o.CC, DOL: o.DOL, total: o.CC + o.DOL, faltan: [] });
    const cargas = { faltan: [], secciones: [sec('ndcExtra', p.ndc), sec('ndcOtras', p.otras), sec('icv', p.icv), sec('wsc', p.wsc), sec('cyo', p.cyo), sec('segm', p.segm)] };
    const egresos = { areas: p.gastos, faltanClaves: [], sinRepartir: 0 };
    const r = resultadoMes(vol, egresos, cargas);
    r.entrada = p;
    return r;
  }

  // ── Por qué del desvío ──
  // Facturación bruta, bonificaciones CMQ y CMV: efecto volumen (cantidades a precio presupuestado)
  // y efecto precio (diferencia de precio unitario sobre el volumen real), por segmento.
  // real: { vol:{volCC,volDOL,phl,tshl,cmv,fn} } ; p: entrada del presupuesto ; suc: 'T'|'CC'|'DOL'
  function efectosVolPrecio(volReal, p, suc) {
    if (!volReal || !p) return null;
    const vR = GRUPOS.map((_, i) => suc === 'CC' ? +volReal.volCC[i] || 0 : suc === 'DOL' ? +volReal.volDOL[i] || 0 : (+volReal.volCC[i] || 0) + (+volReal.volDOL[i] || 0));
    const vP = GRUPOS.map((_, i) => suc === 'CC' ? p.volCC[i] : suc === 'DOL' ? p.volDOL[i] : p.volCC[i] + p.volDOL[i]);
    const cmvR = GRUPOS.map((_, i) => { const a = (volReal.cmv || [])[i] || 0, b = (volReal.cmv || [])[i + 7] || 0; return suc === 'CC' ? a : suc === 'DOL' ? b : a + b; });
    const unit = (tot, v) => v ? tot / v : 0;
    const mk = (precioR, precioP) => {
      const seg = GRUPOS.map((g, i) => ({ label: g, vol: (vR[i] - vP[i]) * precioP[i], precio: (precioR[i] - precioP[i]) * vR[i] }));
      return { volumen: S(seg.map(s => s.vol)), precio: S(seg.map(s => s.precio)), seg };
    };
    const phlR = volReal.phl || z7();
    const tsR = (volReal.tshl || []).slice(0, 7);
    const cmvUnitR = cmvR.map((x, i) => unit(x, vR[i]));
    const cmvUnitP = GRUPOS.map((_, i) => p.phl[i] / (1 + (p.margen[i] || 0)));
    return {
      volR: S(vR), volP: S(vP),
      fb: mk(phlR, p.phl),
      bonCMQ: mk(tsR, p.tsCMQ),
      cmv: mk(cmvUnitR, cmvUnitP),
    };
  }

  // Gastos por renglón: real (de PresupuestoEgresos.repartir().filas) contra presupuesto (p.renglones)
  function desvioRenglones(filasReal, p, suc) {
    if (!p || !p.renglones) return [];
    const k = suc === 'T' ? 'total' : suc;
    const pre = Object.fromEntries(p.renglones.map(r => [r.fila, r]));
    const out = [];
    (filasReal || []).forEach(f => {
      const R = suc === 'T' ? f.total : f[suc], P = pre[f.fila] ? pre[f.fila][k] : 0;
      if (Math.abs(R) < 0.5 && Math.abs(P) < 0.5) return;
      out.push({ fila: f.fila, area: f.area, label: f.label, R, P, D: R - P, pendiente: !!f.pendiente });
    });
    return out.sort((a, b) => Math.abs(b.D) - Math.abs(a.D));
  }

  // Lista de líneas para la vista mes a mes
  const LINEAS_MES = ['vol', 'fb', 'bonCMQ', 'cmv', 'fn', 'ndcExtra', 'ndcOtras', 'icv', 'wsc', 'cyo', 'segm', 'mo', 'mb', 'gastos', 'ebitda', 'iibb', 'un'];

  const api = { SECCIONES, calcularCargas, GRUPOS, AREAS, resultadoMes, leerPresupuesto, presupuestoMes, efectosVolPrecio, desvioRenglones, LINEAS_MES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PresupuestoResultado = api;
})(typeof window !== 'undefined' ? window : this);

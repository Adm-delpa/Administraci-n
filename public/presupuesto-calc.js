/* Presupuesto — motor de cálculo de la planilla auxiliar.
 * Replica lo que hace "Planilla auxiliar presupuesto.xlsx" a partir de los
 * 3 reportes de CMQ (Seguimiento Gasto TS, Seguimiento Venta TS y
 * Presupuesto Costos - Facturación) y devuelve, por mes, los valores que se
 * cargan en la hoja Volumen del presupuesto.
 * Funciona en el navegador (window.PresupuestoCalc) y en Node (module.exports).
 */
(function (root) {
  'use strict';

  // Agrupaciones en el orden de las filas de la hoja Volumen
  const GRUPOS = [
    { id: 'ABOVE', label: 'CERVEZAS ABOVE CORE', segs: ['CORE +', 'PREMIUM', 'SUPER PREMIUM'] },
    { id: 'CORE', label: 'CERVEZAS CORE + VALUE', segs: ['CORE', 'VALUE'] },
    { id: 'UNGP', label: 'UNG PREMIUM', segs: ['TOP UNG'] },
    { id: 'UNGS', label: 'UNG SIN PREMIUM', segs: ['UNG FAM'] },
    { id: 'AGUAS', label: 'AGUAS', segs: ['AGUAS ECO'] },
    { id: 'VINOS', label: 'VINOS Y ADY', segs: ['ADYACENCIAS', 'VINO'] },
    { id: 'MKT', label: 'MARKETPLACE ALIMENTOS', segs: ['MARKETPLACE ALIMENTOS'] },
  ];
  const SEG_A_GRUPO = {};
  GRUPOS.forEach(g => g.segs.forEach(s => { SEG_A_GRUPO[s] = g.id; }));
  const SUCURSALES = ['CC', 'DOL'];

  // Codificación tomada de la hoja "Codif" de la planilla auxiliar
  const CODIF_DEFAULT = {
    marca: {"27 EAZY":"Super Premium","ANDES":"Core","ANDES ORIGEN FRESQUITA":"Core +","ANDES ORIGEN IPA":"Core +","ANDES ORIGEN IPA ROJA":"Core +","ANDES ORIGEN NEGRA":"Core +","ANDES ORIGEN ROJA":"Core +","ANDES ORIGEN RUBIA":"Core +","ANDES ORIGEN RUBIA ORO":"Core +","BOCK QUILMES":"Core","BRAHMA":"Core","BRAHMA DORADA":"Core","BUDWEISER":"Core","CORONA":"Super Premium","CORONA CERO":"Super Premium","GOOSE ISLAND":"Premium","GOOSE ISLAND LAGER":"Premium","MICHELOB ULTRA":"Core +","MICHELOB ULTRA GLUTEN FREE":"Core +","PAT SENDERO":"Super Premium","PATAGONIA 24.7":"Super Premium","PATAGONIA AMBER LAGER":"Super Premium","PATAGONIA BOHEMIAN PILSENER":"Super Premium","PATAGONIA HOPPY LAGER":"Super Premium","PATAGONIA IPA":"Super Premium","PATAGONIA IPA ESTELAR":"Super Premium","PATAGONIA LAGER DEL SUR":"Super Premium","PATAGONIA TRAVESIA":"Super Premium","PATAGONIA VERA IPA":"Super Premium","PATAGONIA WEISSE":"Super Premium","QUILMES":"Core","QUILMES 0.0%":"Core","QUILMES 1890":"Value","QUILMES BAJO CERO":"Value","QUILMES CLASICA":"Core","QUILMES DOBLE":"Core","QUILMES IPA":"Core","QUILMES RED LAGER":"Core","STELLA ARTOIS":"Premium","STELLA ARTOIS 0.0%":"Premium","STELLA ARTOIS BLANCHE":"Premium","STELLA ARTOIS LAGER":"Premium","STELLA ARTOIS NOIRE":"Premium","STOUT QUILMES":"Core","TEMPLE COSMICA":"Super Premium","TEMPLE GOLDEN":"Super Premium","TEMPLE HONEY":"Super Premium","TEMPLE SCOTISH":"Super Premium","TEMPLE WOLF IPA":"Super Premium"},
    ung: {"1250 CC PET":"UNG FAM","1500 CC PET":"UNG FAM","2.25L":"UNG FAM","2000 CC PET":"UNG FAM","2250 CC PET":"UNG FAM","250 CC LATAS":"TOP UNG","269 CC LATA":"TOP UNG","3000 CC PET":"UNG FAM","354 CC":"TOP UNG","354 CC LATA":"TOP UNG","355 CC LATA":"TOP UNG","500 CC PET":"TOP UNG","500 CC VD S/R":"TOP UNG","750 CC PET":"TOP UNG","TETRA 1L":"UNG FAM","2000 RECO":"UNG FAM","473 CC":"TOP UNG"},
    acciones: [{"codigo":12,"accion":"VENTA INTERNA","validada":false},{"codigo":2026,"accion":"HASTA AGOTAR STOCK 20% SUCURSAL","validada":false},{"codigo":2946,"accion":"VENTA INTERNA","validada":false},{"codigo":3546,"accion":"HASTA AGOTAR STOCK 20% CENTRAL","validada":false},{"codigo":4347,"accion":"ADICIONAL SIDRAS DELPA","validada":true},{"codigo":4406,"accion":"DESCENTRALIZADA ENTRE FRONTERAS LATA CMQ","validada":true},{"codigo":4407,"accion":"DESCENTRALIZADA ENTRE FRONTERAS LATA Dp","validada":false},{"codigo":4409,"accion":"AJUSTE II ENTRE FRONTERAS LATa","validada":false},{"codigo":4618,"accion":"CNC MKTPLACe","validada":false},{"codigo":4742,"accion":"COSTA VINOS DEL PALACIo","validada":true},{"codigo":4758,"accion":"OBLEAS 12%","validada":false},{"codigo":4759,"accion":"TALITAS URQUIZA","validada":false},{"codigo":4762,"accion":"DPM-ACCION ESPECIAL RED BULL FEBRERO","validada":true},{"codigo":4775,"accion":"CNC CERVEZA FEBRERO","validada":true},{"codigo":4776,"accion":"CNC CERVEZA FEBRERO","validada":true},{"codigo":4777,"accion":"CNC CERVEZA FEBRERO","validada":true},{"codigo":4778,"accion":"CNC CERVEZA FEBRERO","validada":true},{"codigo":4800,"accion":"10% ADIC TODDY 180 GR","validada":false},{"codigo":4801,"accion":"ACCION CNC DELPA","validada":false},{"codigo":4802,"accion":"LITRO / LATA CORE","validada":true},{"codigo":4814,"accion":"H2OH STILL","validada":true},{"codigo":4844,"accion":"PTR MINIMO AUTORIZADO COSTa","validada":true},{"codigo":4847,"accion":"CNC AGUAS SUCURSAL","validada":true},{"codigo":4854,"accion":"FRESCURA RED","validada":true},{"codigo":4855,"accion":"FRESCURA RCMQ OBLEAs","validada":true},{"codigo":4856,"accion":"FRESCURA RCMQ POLENTa","validada":true},{"codigo":4887,"accion":"CNC ENERGIA MARZO","validada":true},{"codigo":4888,"accion":"CNC SS MARZo","validada":true},{"codigo":4889,"accion":"CNC 2000 CC MARZo","validada":true},{"codigo":4890,"accion":"CNC DANTE CONEXION","validada":false},{"codigo":4960,"accion":"FRESCURA MIRINDA1500","validada":false},{"codigo":4986,"accion":"FRESCURA 7UP AXl","validada":false},{"codigo":4994,"accion":"AGUAS JUNIO NPv","validada":false},{"codigo":4995,"accion":"AGUAS JUNIO DELPa","validada":false},{"codigo":4996,"accion":"AGUAS JUNIO NPV 2","validada":false},{"codigo":4998,"accion":"BD RED BULL","validada":false},{"codigo":5045,"accion":"TBD RED BULl","validada":false},{"codigo":5130,"accion":"H2OH STILL FAM AS","validada":false},{"codigo":5138,"accion":"RED BULL RE 30%","validada":false},{"codigo":5159,"accion":"FRESCURA PATAGONIA DELPa","validada":false},{"codigo":5162,"accion":"JAGER FT RED BULL REd","validada":false},{"codigo":5167,"accion":"H2OH MARCa","validada":false}]
  };

  const norm = v => String(v == null ? '' : v).trim().toUpperCase();
  const num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null || v === '') return 0;
    let s = String(v).trim();
    if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  function prepCodif(c) {
    const marca = {}, ung = {}, acc = {};
    Object.entries(c.marca || {}).forEach(([k, v]) => { marca[norm(k)] = norm(v); });
    Object.entries(c.ung || {}).forEach(([k, v]) => { ung[norm(k)] = norm(v); });
    (c.acciones || []).forEach(a => { acc[String(a.codigo).trim()] = !!a.validada; });
    return { marca, ung, acc };
  }

  // Misma regla que la columna "Segmento" de la auxiliar
  function segmento(cod, un, marca, calibre) {
    const m = cod.marca[norm(marca)];
    if (m) return m;
    if (norm(un) === 'UNG') return cod.ung[norm(calibre)] || 'UNG';
    return norm(un);
  }

  // ── Detección del tipo de reporte por encabezados ──
  function findHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = (rows[i] || []).map(norm);
      if (r.includes('AÑO/MES') || r.includes('ANO/MES')) return i;
    }
    return -1;
  }
  function detectarTipo(headers) {
    const h = headers.map(norm);
    if (h.includes('CÓDIGO ACCIÓN COMERCIAL') || h.includes('ACCIÓN COMERCIAL')) return 'gasto';
    if (h.includes('IMPORTE BRUTO PNIT') || h.includes('IMPORTE NETO')) return 'costos';
    if (h.includes('CANTIDAD TOTAL EN HL')) return 'ventas';
    return null;
  }
  function col(headers, ...names) {
    const h = headers.map(norm);
    for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; }
    return -1;
  }

  // rows: array de arrays (sheet_to_json header:1). Devuelve {tipo, registros}
  function parsearReporte(rows) {
    const hi = findHeaderRow(rows);
    if (hi < 0) throw new Error('No se encontró la fila de encabezados (columna "Año/Mes").');
    const headers = rows[hi];
    const tipo = detectarTipo(headers);
    if (!tipo) throw new Error('No se reconoce el reporte: no es Gasto TS, Venta TS ni Costos-Facturación.');
    const C = {
      mes: col(headers, 'Año/Mes'),
      codSuc: col(headers, 'Código Sucursal'),
      suc: col(headers, 'Sucursal'),
      un: col(headers, 'Unidad de Negocio'),
      marca: col(headers, 'Marca'),
      calibre: col(headers, 'Calibre'),
      codAcc: col(headers, 'Código Acción Comercial'),
      acc: col(headers, 'Acción Comercial'),
      cat: col(headers, 'Categoría de Trade Spend'),
      ts: col(headers, 'Trade Spend PNSF'),
      hl: col(headers, 'Cantidad Total en HL'),
      pnit: col(headers, 'Importe Bruto PNIT'),
      lista: col(headers, 'Importe Bruto Precio Lista'),
      neto: col(headers, 'Importe Neto'),
    };
    const falta = [];
    const req = { gasto: ['mes', 'un', 'marca', 'calibre', 'codAcc', 'cat', 'ts'], ventas: ['mes', 'un', 'marca', 'calibre', 'hl'], costos: ['mes', 'suc', 'un', 'marca', 'calibre', 'pnit', 'lista', 'neto'] }[tipo];
    req.forEach(k => { if (C[k] < 0) falta.push(k); });
    if (tipo !== 'costos' && C.codSuc < 0 && C.suc < 0) falta.push('sucursal');
    if (falta.length) throw new Error('Al reporte le faltan columnas: ' + falta.join(', '));

    const registros = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r[C.mes] == null || r[C.mes] === '') continue;
      const mes = String(r[C.mes]).trim();
      if (!/^\d{4}\/\d{2}$/.test(mes)) continue; // totales u otras filas
      const o = { mes, un: r[C.un], marca: r[C.marca], calibre: r[C.calibre] };
      // Sucursal: en Venta TS la auxiliar usa el código (1 = Casa Central)
      if (C.codSuc >= 0 && r[C.codSuc] !== '' && r[C.codSuc] != null) o.suc = num(r[C.codSuc]) === 1 ? 'CC' : 'DOL';
      else o.suc = norm(r[C.suc]) === 'CASA CENTRAL' ? 'CC' : 'DOL';
      if (tipo === 'costos' && C.suc >= 0) {
        const s = norm(r[C.suc]);
        o.suc = s === 'CASA CENTRAL' ? 'CC' : s === 'SUCURSAL DOLORES' ? 'DOL' : null;
        o.sucTxt = r[C.suc];
      }
      if (tipo === 'gasto') { o.codAcc = r[C.codAcc]; o.acc = C.acc >= 0 ? r[C.acc] : ''; o.cat = r[C.cat]; o.ts = num(r[C.ts]); }
      if (tipo === 'ventas') { o.hl = num(r[C.hl]); }
      if (tipo === 'costos') { o.pnit = num(r[C.pnit]); o.lista = num(r[C.lista]); o.neto = num(r[C.neto]); }
      registros.push(o);
    }
    return { tipo, registros };
  }

  const zeros = () => Object.fromEntries(GRUPOS.map(g => [g.id, 0]));

  // data: {gasto:[], ventas:[], costos:[]} (registros ya parseados)
  // Devuelve { meses: {'2026/10': {...}}, avisos: [...] }
  function calcular(data, codifRaw) {
    const cod = prepCodif(codifRaw || CODIF_DEFAULT);
    const avisos = [];
    const sinGrupo = {}; // segmento no reconocido -> {fuente, marca, un, calibre, valor}
    const accDesconocidas = {};
    const meses = {};
    const M = mes => {
      if (!meses[mes]) meses[mes] = {
        vol: { CC: zeros(), DOL: zeros() },
        pnit: { CC: zeros(), DOL: zeros() },
        lista: { CC: zeros(), DOL: zeros() },
        neto: { CC: 0, DOL: 0 },
        ts: { CMQ: zeros(), DISTRI: zeros() },
        tsExcluido: 0,
        fuentes: {},
      };
      return meses[mes];
    };
    const regSinGrupo = (fuente, r, seg, valor) => {
      const k = fuente + '|' + seg + '|' + norm(r.marca) + '|' + norm(r.calibre);
      if (!sinGrupo[k]) sinGrupo[k] = { fuente, segmento: seg, un: r.un, marca: r.marca, calibre: r.calibre, valor: 0, meses: new Set() };
      sinGrupo[k].valor += valor; sinGrupo[k].meses.add(r.mes);
    };

    (data.ventas || []).forEach(r => {
      const m = M(r.mes); m.fuentes.ventas = true;
      const seg = segmento(cod, r.un, r.marca, r.calibre);
      const g = SEG_A_GRUPO[seg];
      if (!g) { regSinGrupo('Venta TS (HL)', r, seg, r.hl); return; }
      m.vol[r.suc][g] += r.hl;
    });

    (data.costos || []).forEach(r => {
      const m = M(r.mes); m.fuentes.costos = true;
      if (!r.suc) { avisos.push({ tipo: 'sucursal', texto: 'Costos-Facturación: sucursal no reconocida "' + r.sucTxt + '" (' + r.mes + ').' }); return; }
      m.neto[r.suc] += r.neto;
      const seg = segmento(cod, r.un, r.marca, r.calibre);
      const g = SEG_A_GRUPO[seg];
      if (!g) { regSinGrupo('Costos-Facturación (PNIT)', r, seg, r.pnit); return; }
      m.pnit[r.suc][g] += r.pnit;
      m.lista[r.suc][g] += r.lista;
    });

    (data.gasto || []).forEach(r => {
      const m = M(r.mes); m.fuentes.gasto = true;
      let cat = norm(r.cat);
      if (cat === 'ACCIONES DESCENTRALIZADAS') {
        const k = String(r.codAcc == null ? '' : r.codAcc).trim();
        if (!(k in cod.acc)) {
          // En la auxiliar esto da #N/A y el importe queda afuera de los cálculos
          if (!accDesconocidas[k]) accDesconocidas[k] = { codigo: k, accion: r.acc, ts: 0, meses: new Set() };
          accDesconocidas[k].ts += r.ts; accDesconocidas[k].meses.add(r.mes);
          m.tsExcluido += r.ts;
          return;
        }
        cat = cod.acc[k] ? 'ACCIONES DESCENTRALIZADAS VALIDADAS' : 'ACCIONES DESCENTRALIZADAS';
      }
      const aCargo = (cat === 'ACCIONES DESCENTRALIZADAS' || cat === 'BONIFICACIONES MANUALES') ? 'DISTRI' : 'CMQ';
      const seg = segmento(cod, r.un, r.marca, r.calibre);
      const g = SEG_A_GRUPO[seg];
      if (!g) { regSinGrupo('Gasto TS ($)', r, seg, r.ts); return; }
      m.ts[aCargo][g] += r.ts;
    });

    // Derivados
    Object.values(meses).forEach(m => {
      m.volTot = zeros(); m.pnitTot = zeros(); m.phl = zeros();
      m.tshl = { CMQ: zeros(), DISTRI: zeros() };
      GRUPOS.forEach(({ id }) => {
        m.volTot[id] = m.vol.CC[id] + m.vol.DOL[id];
        m.pnitTot[id] = m.pnit.CC[id] + m.pnit.DOL[id];
        m.phl[id] = m.volTot[id] ? m.pnitTot[id] / m.volTot[id] : 0;
        m.tshl.CMQ[id] = m.volTot[id] ? m.ts.CMQ[id] / m.volTot[id] : 0;
        m.tshl.DISTRI[id] = m.volTot[id] ? m.ts.DISTRI[id] / m.volTot[id] : 0;
      });
      m.netoTot = m.neto.CC + m.neto.DOL;
    });

    const sg = Object.values(sinGrupo).map(x => ({ ...x, meses: [...x.meses].sort() }));
    const ad = Object.values(accDesconocidas).map(x => ({ ...x, meses: [...x.meses].sort() }));
    return { meses, sinGrupo: sg, accionesDesconocidas: ad, avisos };
  }

  // Bloques listos para pegar en la hoja Volumen del presupuesto (una columna por mes)
  function bloquesVolumen(m) {
    const by = (obj) => GRUPOS.map(g => obj[g.id]);
    const labels = GRUPOS.map(g => g.label);
    const requiere = { vol: 'ventas', costos: 'costos', ts: 'gasto' };
    const b = [];
    b.push({ id: 'volTot', titulo: 'Volumen real (HL) — Total', rango: 'filas 4 a 10', labels, valores: by(m.volTot), fuente: 'ventas' });
    b.push({ id: 'volCC', titulo: 'Volumen real (HL) — Casa Central', rango: 'filas 12 a 18', labels, valores: by(m.vol.CC), fuente: 'ventas' });
    b.push({ id: 'volDOL', titulo: 'Volumen real (HL) — Dolores', rango: 'filas 20 a 26', labels, valores: by(m.vol.DOL), fuente: 'ventas' });
    b.push({ id: 'phl', titulo: '$/HL real a PNIT', rango: 'filas 30 a 36', labels, valores: by(m.phl), fuente: ['ventas', 'costos'] });
    b.push({ id: 'tshl', titulo: 'Resumen gasto TS/HL', rango: 'filas 129 a 142', labels: labels.map(l => 'CMQ · ' + l).concat(labels.map(l => 'DEL PALACIO · ' + l)), valores: by(m.tshl.CMQ).concat(by(m.tshl.DISTRI)), fuente: ['ventas', 'gasto'] });
    b.push({ id: 'cmv', titulo: 'CMV a precio lista', rango: 'filas 152 a 165', labels: labels.map(l => 'CC · ' + l).concat(labels.map(l => 'DOL · ' + l)), valores: by(m.lista.CC).concat(by(m.lista.DOL)), fuente: 'costos' });
    b.push({ id: 'fn', titulo: 'Facturación neta', rango: 'filas 168 a 169', labels: ['CASA CENTRAL', 'SUCURSAL DOLORES'], valores: [m.neto.CC, m.neto.DOL], fuente: 'costos' });
    b.forEach(x => {
      const f = [].concat(x.fuente);
      x.faltan = f.filter(k => !m.fuentes[k]);
    });
    return b;
  }

  const api = { GRUPOS, SUCURSALES, CODIF_DEFAULT, parsearReporte, calcular, bloquesVolumen, segmento: (c, ...a) => segmento(prepCodif(c), ...a) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PresupuestoCalc = api;
})(typeof window !== 'undefined' ? window : this);

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

  const api = { SECCIONES, calcularCargas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PresupuestoResultado = api;
})(typeof window !== 'undefined' ? window : this);

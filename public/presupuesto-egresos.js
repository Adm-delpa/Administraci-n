/* Presupuesto — egresos reales desde Chess (Nivel 2, parte 1).
 * Replica la hoja REAL del presupuesto: agrupa los "Egresos tipificados" de
 * Chess por renglón (concepto) y mes, y los reparte entre Casa Central y
 * Dolores con las mismas claves que la hoja (volumen, camiones, litros,
 * personas, sucursal real, mitades), corrigiendo las fórmulas rotas.
 * Funciona en el navegador (window.PresupuestoEgresos) y en Node.
 */
(function (root) {
  'use strict';

  // [fila de la hoja REAL, área, renglón]
  const FILAS = [[4,"VENTAS","PUBLICIDAD - VENTAS Y PROMOCION"],
    [5,"VENTAS","TELEFONÍA MÓVIL - VENTAS Y PROMOCION"],
    [6,"VENTAS","PEAJES - VENTAS Y PROMOCION"],
    [7,"VENTAS","HOTELES - VENTAS Y PROMOCION"],
    [8,"VENTAS","REPARACIÓN Y MANTENIMIENTO DE MUEBLES Y ÚTILES - VENTAS Y PROMOCION"],
    [9,"VENTAS","CONSUMO PERSONAL - VENTAS Y PROMOCION"],
    [10,"VENTAS","ATENCIONES AL PERSONAL - VENTAS Y PROMOCION"],
    [11,"VENTAS","CUOTA MENSUAL DE SISTEMAS - VENTAS Y PROMOCION"],
    [12,"VENTAS","MUEBLES Y UTILES VALORES ORIGINALES - VENTAS Y PROMOCION"],
    [13,"VENTAS","OTROS CONCEPTOS NO REMUNERATIVOS - VENTAS Y PROMOCION"],
    [14,"VENTAS","ROPA DE TRABAJO - VENTAS Y PROMOCION"],
    [15,"VENTAS","SUELDOS - VENTAS Y PROMOCION"],
    [16,"VENTAS","APORTES OBRAS SOCIALES(302) - VENTAS Y PROMOCIÓN"],
    [18,"OPERACIONES","ENVASE NO ACREDITABLE - OPERACIONES"],
    [19,"OPERACIONES","ALQUILERES DE AUTOELEVADORES - OPERACIONES"],
    [20,"OPERACIONES","OTROS - OPERACIONES"],
    [21,"OPERACIONES","ROPA DE TRABAJO - OPERACIONES"],
    [22,"OPERACIONES","REPARACIÓN Y MANTENIMIENTO DE AUTOELEVADORES - OPERACIONES"],
    [23,"OPERACIONES","NEUMÁTICOS DE RODADOS - OPERACIONES"],
    [24,"OPERACIONES","CONSUMO PERSONAL - OPERACIONES"],
    [25,"OPERACIONES","OTROS CONCEPTOS NO REMUNERATIVOS - OPERACIONES"],
    [26,"OPERACIONES","FLETES - OPERACIONES"],
    [27,"OPERACIONES","REPARACIÓN Y MANTENIMIENTO DE RODADOS - OPERACIONES"],
    [28,"OPERACIONES","MENSAJERÍA - OPERACIONES"],
    [29,"OPERACIONES","REMISES - OPERACIONES"],
    [30,"OPERACIONES","PEAJES - OPERACIONES"],
    [31,"OPERACIONES","INSUMOS DE COMPUTACIÓN - OPERACIONES"],
    [32,"OPERACIONES","ATENCIONES AL PERSONAL - OPERACIONES"],
    [33,"OPERACIONES","REPARACIÓN Y MANTENIMIENTO DE MUEBLES Y ÚTILES - OPERACIONES"],
    [34,"OPERACIONES","SEGURO RODADOS - OPERACIONES"],
    [35,"OPERACIONES","SUELDOS - OPERACIONES"],
    [36,"OPERACIONES","APORTES OBRAS SOCIALES(302) - OPERACIONES"],
    [38,"INFRAESTRUCTURA","SERVICIO DE LIMPIEZA Y DESINFECCIÓN - INFRAESTRUCTURA"],
    [39,"INFRAESTRUCTURA","ELECTRICIDAD - INFRAESTRUCTURA"],
    [40,"INFRAESTRUCTURA","REPARACIÓN Y MANTENIMIENTO DE INSTALACIONES - INFRAESTRUCTURA"],
    [41,"INFRAESTRUCTURA","SEGURIDAD PRIVADA - INFRAESTRUCTURA"],
    [42,"INFRAESTRUCTURA","INTERNET - INFRAESTRUCTURA"],
    [43,"INFRAESTRUCTURA","AGUA - INFRAESTRUCTURA"],
    [44,"INFRAESTRUCTURA","GAS - INFRAESTRUCTURA"],
    [45,"INFRAESTRUCTURA","CONSUMO PERSONAL - INFRAESTRUCTURA"],
    [46,"INFRAESTRUCTURA","ALQUILERES DE INMUEBLES - INFRAESTRUCTURA"],
    [47,"INFRAESTRUCTURA","OTROS - INFRAESTRUCTURA"],
    [48,"INFRAESTRUCTURA","REPARACIÓN Y MANTENIMIENTO DE EQUIPOS DE FRÍO Y POP PESADO - INFRAESTRUCTURA"],
    [49,"INFRAESTRUCTURA","ATENCIONES AL PERSONAL - INFRAESTRUCTURA"],
    [51,"DISTRIBUCION","COMBUSTIBLES - DISTRIBUCION"],
    [52,"DISTRIBUCION","SEGURO RODADOS - DISTRIBUCION"],
    [53,"DISTRIBUCION","OTROS CONCEPTOS NO REMUNERATIVOS - DISTRIBUCION"],
    [54,"DISTRIBUCION","REPARACIÓN Y MANTENIMIENTO DE RODADOS - DISTRIBUCION"],
    [55,"DISTRIBUCION","ROPA DE TRABAJO - DISTRIBUCION"],
    [56,"DISTRIBUCION","RASTREO SATELITAL - DISTRIBUCION"],
    [57,"DISTRIBUCION","NEUMÁTICOS DE RODADOS - DISTRIBUCION"],
    [58,"DISTRIBUCION","PEAJES - DISTRIBUCION"],
    [59,"DISTRIBUCION","CONSUMO PERSONAL - DISTRIBUCION"],
    [60,"DISTRIBUCION","OTROS - DISTRIBUCION"],
    [61,"DISTRIBUCION","LUBRICANTES Y ACEITES - DISTRIBUCION"],
    [62,"DISTRIBUCION","MANTENIMIENTO DE SISTEMAS - DISTRIBUCION"],
    [63,"DISTRIBUCION","SUELDOS - DISTRIBUCION"],
    [64,"DISTRIBUCION","APORTES OBRAS SOCIALES(302) - DISTRIBUCION"],
    [66,"ACARREO","COSTOS DE SUBCONTRATACIÓN DE FLOTA - ACARREO"],
    [67,"ACARREO","PEAJES - ACARREO"],
    [68,"ACARREO","OTROS - ACARREO"],
    [69,"ACARREO","SEGURO DE MERCADERÍAS EN TRÁNSITO. - ACARREO"],
    [70,"ACARREO","OTROS CONCEPTOS NO REMUNERATIVOS - ACARREO"],
    [72,"ADMIN Y FINANZAS","ND BANCARIA (14-SUELDOS PERSONAL)"],
    [73,"ADMIN Y FINANZAS","OTROS IMPUESTOS - ADMIN Y FINANZAS"],
    [74,"ADMIN Y FINANZAS","ITF"],
    [75,"ADMIN Y FINANZAS","ND BANCARIA (10-PAGO PRESTAMO BANCARIO)"],
    [76,"ADMIN Y FINANZAS","CUOTA SINDICAL - ADMIN Y FINANZAS"],
    [77,"ADMIN Y FINANZAS","ND BANCARIA (17-INTERESES PAGADOS)"],
    [78,"ADMIN Y FINANZAS","MANTENIMIENTO DE SISTEMAS - ADMIN Y FINANZAS"],
    [79,"ADMIN Y FINANZAS","ESTUDIO CONTABLE E IMPOSITIVO - ADMIN Y FINANZAS"],
    [80,"ADMIN Y FINANZAS","GASTOS MÉDICOS - ADMIN Y FINANZAS"],
    [81,"ADMIN Y FINANZAS","SEGURIDAD PRIVADA - ADMIN Y FINANZAS"],
    [82,"ADMIN Y FINANZAS","ND BANCARIA (3-GASTOS BANCARIOS)"],
    [83,"ADMIN Y FINANZAS","OTROS HONORARIOS - ADMIN Y FINANZAS"],
    [84,"ADMIN Y FINANZAS","CUOTA MENSUAL DE SISTEMAS - ADMIN Y FINANZAS"],
    [85,"ADMIN Y FINANZAS","INSUMOS DE COMPUTACIÓN - ADMIN Y FINANZAS"],
    [86,"ADMIN Y FINANZAS","ND BANCARIA (13-PRESTAMO BANCARIO)"],
    [87,"ADMIN Y FINANZAS","REPARACIÓN Y MANTENIMIENTO DE MUEBLES Y ÚTILES - ADMIN Y FINANZAS"],
    [88,"ADMIN Y FINANZAS","CONSUMO PERSONAL - ADMIN Y FINANZAS"],
    [89,"ADMIN Y FINANZAS","PAPELERÍA/LIBRERÍA - ADMIN Y FINANZAS"],
    [90,"ADMIN Y FINANZAS","ELEMENTOS DE SEGURIDAD PARA EL PERSONAL - ADMIN Y FINANZAS"],
    [91,"ADMIN Y FINANZAS","SEGURO DE VIDA - ADMIN Y FINANZAS"],
    [92,"ADMIN Y FINANZAS","MENSAJERÍA - ADMIN Y FINANZAS"],
    [93,"ADMIN Y FINANZAS","RECONOCIMIENTO EVENTUAL DE MOVILIDAD Y VIÁTICOS - ADMIN Y FINANZAS"],
    [94,"ADMIN Y FINANZAS","OTROS CONCEPTOS NO REMUNERATIVOS - ADMIN Y FINANZAS"],
    [95,"ADMIN Y FINANZAS","OTROS - ADMIN Y FINANZAS"],
    [96,"ADMIN Y FINANZAS","SICORE IMPUESTO A LAS GANANCIAS(217) - ADMIN Y FINANZAS"],
    [97,"ADMIN Y FINANZAS","NC BANCARIA (13-PRESTAMO BANCARIO)"],
    [98,"ADMIN Y FINANZAS","ND BANCARIA (5-IMPUESTOS A LOS SELLOS)"],
    [99,"ADMIN Y FINANZAS","ND BANCARIA (32-DB. RG 5463)"],
    [100,"ADMIN Y FINANZAS","ND BANCARIA (7-IVA)"],
    [101,"ADMIN Y FINANZAS","PERCEPCIONES INGRESOS BRUTOS - ADMIN Y FINANZAS"],
    [102,"ADMIN Y FINANZAS","GASTOS BANCARIOS - ADMIN Y FINANZAS"],
    [103,"ADMIN Y FINANZAS","MUEBLES Y UTILES VALORES ORIGINALES - ADMIN Y FINANZAS"],
    [104,"ADMIN Y FINANZAS","ESTUDIO JURÍDICO - ADMIN Y FINANZAS"],
    [105,"ADMIN Y FINANZAS","ATENCIONES AL PERSONAL - ADMIN Y FINANZAS"],
    [106,"ADMIN Y FINANZAS","ESCRIBANÍA - ADMIN Y FINANZAS"],
    [107,"ADMIN Y FINANZAS","INTERESES POR FINANCIACIÓN - ADMIN Y FINANZAS"],
    [108,"ADMIN Y FINANZAS","TASA DE SEGURIDAD E HIGIENE - ADMIN Y FINANZAS"],
    [109,"ADMIN Y FINANZAS","ND BANCARIA (8-ARBA IMP.AUT)"],
    [110,"ADMIN Y FINANZAS","LICENCIA REBA - ADMIN Y FINANZAS"],
    [111,"ADMIN Y FINANZAS","CONTRIBUCIONES OBRA SOCIAL(352) - ADMIN Y FINANZAS"],
    [112,"ADMIN Y FINANZAS","ART LEY 24557(312) - ADMIN Y FINANZAS"],
    [113,"ADMIN Y FINANZAS","SICORE-IMPUESTO AL VALOR AGREGADO(767) - ADMIN Y FINANZAS"],
    [114,"ADMIN Y FINANZAS","OTROS SERVICIOS - ADMIN Y FINANZAS"],
    [115,"ADMIN Y FINANZAS","ND BANCARIA (20-RETENCION IVA)"],
    [116,"ADMIN Y FINANZAS","SEGURO CONTRA INCENDIOS - ADMIN Y FINANZAS"],
    [117,"ADMIN Y FINANZAS","ND BANCARIA (35-COMISION CUENTA)"],
    [118,"ADMIN Y FINANZAS","ND BANCARIA (36-COMISION ANUAL)"],
    [119,"ADMIN Y FINANZAS","ND BANCARIA (34-AFIP RE.R5321)"],
    [120,"ADMIN Y FINANZAS","IMPUESTO INMOBILIARIO - ADMIN Y FINANZAS"],
    [121,"ADMIN Y FINANZAS","REMISES - ADMIN Y FINANZAS"],
    [122,"ADMIN Y FINANZAS","PUBLICIDAD - ADMIN Y FINANZAS"],
    [123,"ADMIN Y FINANZAS","ND BANCARIA (9-ARBA IMP INMOB.)"],
    [124,"ADMIN Y FINANZAS","ND BANCARIA (DEBYCR-IMP. DEB Y CREDITOS)"],
    [125,"ADMIN Y FINANZAS","SUELDOS - ADMINISTRACIÓN"],
    [126,"ADMIN Y FINANZAS","APORTES OBRAS SOCIALES(302) - ADMIN Y FINANZAS"]];

  // Reglas especiales por fila. Por defecto: suma por "Concepto" = renglón y reparto por volumen.
  //  match: 'egreso' = suma por "Descripción Egreso" en vez de "Concepto"
  //  reparto: vol | camiones | litros | personas | personasOper | personasDist | mitad | cc | dol | sucursal | proveedor
  //  fuente: egresos (default) | sueldos | aportes (factor 0.5 = 50% de los sueldos, confirmado; el SOP dice 0,5% por error) | acarreo | sinDato
  const REGLAS = {
    5:  { reparto: 'personas', corrige: 'En el Excel las partes de Casa Central y Dolores no suman el total (divide por otra cantidad de personas).' },
    15: { fuente: 'sueldos', sector: 'ventas' },
    16: { fuente: 'aportes', de: 15, factor: 0.5 },
    19: { reparto: 'cc' },
    21: { reparto: 'personasOper', corrige: 'En el Excel da 0 cuando falta la dotación del mes y el gasto se pierde.' },
    23: { reparto: 'mitad' },
    35: { fuente: 'sueldos', sector: 'operaciones' },
    36: { fuente: 'aportes', de: 35, factor: 0.5 },
    38: { match: 'egreso', valor: 'SERVICIO DE LIMPIEZA Y DESINFECCIÓN', reparto: 'mitad' },
    39: { reparto: 'proveedor', proveedores: { CC: 'C.L.Y.F.E.M.A.', DOL: 'EDEA' } },
    40: { match: 'egreso', valor: 'REPARACIÓN Y MANTENIMIENTO DE INSTALACIONES', reparto: 'sucursal' },
    41: { reparto: 'sucursal' },
    42: { match: 'egreso', valor: 'INTERNET', reparto: 'sucursal' },
    43: { reparto: 'sucursal' },
    44: { reparto: 'sucursal' },
    46: { reparto: 'dol' },
    47: { reparto: 'sucursal', corrige: 'En el Excel la parte de Dolores filtra "CASA CENTRAL" y duplica el importe de Casa Central.' },
    48: { reparto: 'sucursal', corrige: 'En el Excel la parte de Dolores filtra "CASA CENTRAL" y duplica el importe de Casa Central.' },
    49: { reparto: 'sucursal', corrige: 'En el Excel la parte de Dolores filtra "CASA CENTRAL" y duplica el importe de Casa Central.' },
    51: { reparto: 'litros', corrige: 'En el Excel Casa Central se reparte por volumen y Dolores por litros, así que las dos partes no suman el total.' },
    52: { reparto: 'camiones' },
    53: { reparto: 'camiones', corrige: 'En el Excel la parte de Dolores es un 0 fijo y se pierde.' },
    54: { reparto: 'camiones' },
    55: { reparto: 'personasDist' },
    56: { reparto: 'camiones' },
    57: { reparto: 'camiones' },
    58: { reparto: 'dol' },
    59: { reparto: 'camiones' },
    60: { reparto: 'camiones' },
    61: { reparto: 'camiones' },
    62: { reparto: 'camiones' },
    63: { fuente: 'sueldos', sector: 'distribucion' },
    64: { fuente: 'aportes', de: 63, factor: 0.5 },
    66: { fuente: 'acarreo' },
    72: { fuente: 'sinDato' }, 75: { fuente: 'sinDato' }, 76: { fuente: 'sinDato' }, 77: { fuente: 'sinDato' },
    73: { excluirProveedor: 'ARBA - ING. BRUTOS', masFN: 0.006 },
    74: { match: 'egreso', valor: 'ITF' },
    86: { fuente: 'sinDato' }, 97: { fuente: 'sinDato' }, 101: { fuente: 'sinDato' },
    102: { corrige: 'En el Excel la parte de Dolores toma el renglón de abajo (Muebles y útiles).' },
    103: { corrige: 'En el Excel la parte de Dolores está vacía y se pierde.' },
    112: { fuente: 'sinDato' }, 113: { fuente: 'sinDato' },
    125: { fuente: 'sueldos', sector: 'administracion' },
    126: { fuente: 'aportes', de: 125, factor: 0.5 },
  };

  const CLAVES = [
    { id: 'camiones', label: 'Camiones', ayuda: 'Camiones usados en el mes' },
    { id: 'litros', label: 'Litros de combustible', ayuda: 'Litros cargados en el mes' },
    { id: 'personas', label: 'Personas (total)', ayuda: 'Dotación total, compartidos incluidos' },
    { id: 'personasOper', label: 'Personas de Operaciones', ayuda: '' },
    { id: 'personasDist', label: 'Personas de Distribución', ayuda: '' },
  ];

  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const norm = v => String(v == null ? '' : v).trim().toUpperCase();
  const num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null || v === '') return 0;
    let s = String(v).trim();
    if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s); return isFinite(n) ? n : 0;
  };
  // Fecha de Excel (número de serie) o texto dd/mm/aaaa -> 'AAAA/MM'
  function mesDe(v) {
    if (typeof v === 'number' && v > 20000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
    }
    if (v instanceof Date) return v.getFullYear() + '/' + String(v.getMonth() + 1).padStart(2, '0');
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '/' + m[2].padStart(2, '0'); }
    m = s.match(/^(\d{4})-(\d{2})/);
    if (m) return m[1] + '/' + m[2];
    return null;
  }

  function col(headers, ...names) {
    const h = headers.map(norm);
    for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; }
    return -1;
  }

  // rows: array de arrays del export "Egresos tipificados" (reporte explotado) de Chess
  // sucursalArchivo: 'CC' | 'DOL' | null (si es null se toma de la columna Sucursal/DEPOSITO)
  function parsearEgresos(rows, sucursalArchivo) {
    let hi = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = (rows[i] || []).map(norm);
      if (r.includes('CONCEPTO') && r.includes('TOTAL CPBTE.')) { hi = i; break; }
    }
    if (hi < 0) throw new Error('No parece un export de Egresos tipificados de Chess (faltan las columnas "Concepto" y "Total Cpbte.").');
    const H = rows[hi];
    const C = {
      concepto: col(H, 'Concepto'), fecha: col(H, 'Fecha Comp.'), proveedor: col(H, 'Descripción Cuenta Acreedora'),
      codEgreso: col(H, 'Egreso'), egreso: col(H, 'Descripción Egreso'), suc: col(H, 'Sucursal'), deposito: col(H, 'DEPOSITO'),
      total: col(H, 'Total Cpbte.'), neto: col(H, 'Neto Gravado'), noGrav: col(H, 'No Gravado'), impInt: col(H, 'Imp. Internos'),
      iva: col(H, 'I.V.A.'), comp: col(H, 'Comprobante'),
    };
    const falta = ['concepto', 'fecha', 'total', 'neto', 'noGrav', 'impInt'].filter(k => C[k] < 0);
    if (falta.length) throw new Error('Al export le faltan columnas: ' + falta.join(', '));
    const regs = [], sinFecha = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || (r[C.concepto] === '' && r[C.total] === '')) continue;
      const mes = mesDe(r[C.fecha]);
      if (!mes) { sinFecha.push(i + 1); continue; }
      let suc = sucursalArchivo;
      if (!suc) {
        const d = C.deposito >= 0 ? norm(r[C.deposito]) : '';
        if (d) suc = d.startsWith('DOL') ? 'DOL' : 'CC';
        else suc = num(r[C.suc]) === 2 ? 'DOL' : 'CC';
      }
      regs.push({
        mes, suc,
        concepto: norm(r[C.concepto]), egreso: C.egreso >= 0 ? norm(r[C.egreso]) : '',
        codEgreso: C.codEgreso >= 0 ? num(r[C.codEgreso]) : 0,
        proveedor: C.proveedor >= 0 ? norm(r[C.proveedor]) : '',
        total: num(r[C.total]),
        neto: num(r[C.neto]) + num(r[C.noGrav]) + num(r[C.impInt]),
      });
    }
    return { registros: regs, sinFecha };
  }

  // claves: { vol:{CC,DOL}, camiones:{CC,DOL}, litros:{CC,DOL}, personas:{CC,DOL}, personasOper:{CC,DOL}, personasDist:{CC,DOL}, fnTotal }
  function share(k) {
    if (!k) return null;
    const cc = num(k.CC), dol = num(k.DOL);
    return cc + dol > 0 ? cc / (cc + dol) : null;
  }

  const REPARTO_FIJO = ['sucursal', 'proveedor'];

  // Paso 1: agrupa los comprobantes del mes por renglón. No depende de las claves de
  // prorrateo, así que se puede guardar y repartir después sin volver a subir los exports.
  // opciones.importe: 'neto' (sin IVA, por defecto) | 'total' (como el Excel)
  function agruparMes(registros, mes, opciones) {
    const modo = (opciones && opciones.importe) || 'neto';
    const regsMes = registros.filter(r => r.mes === mes);
    const imp = r => modo === 'total' ? r.total : r.neto;
    const usados = new Set();
    const filas = [];
    FILAS.forEach(([fila, , label]) => {
      const regla = REGLAS[fila] || {};
      if ((regla.fuente || 'egresos') !== 'egresos') return;
      const L = norm(label);
      const match = regla.match === 'egreso' ? (r => r.egreso === norm(regla.valor)) : (r => r.concepto === L);
      const excl = regla.excluirProveedor ? norm(regla.excluirProveedor) : null;
      const sel = regsMes.filter(r => match(r) && (!excl || r.proveedor !== excl));
      if (!sel.length) return;
      sel.forEach(r => usados.add(r));
      const o = { fila, base: sel.reduce((a, r) => a + imp(r), 0), iva: sel.reduce((a, r) => a + (r.total - r.neto), 0) };
      const rep = regla.reparto || 'vol';
      if (rep === 'sucursal') {
        o.CC = sel.filter(r => r.suc === 'CC').reduce((a, r) => a + imp(r), 0);
        o.DOL = sel.filter(r => r.suc === 'DOL').reduce((a, r) => a + imp(r), 0);
      } else if (rep === 'proveedor') {
        o.CC = sel.filter(r => r.proveedor === norm(regla.proveedores.CC)).reduce((a, r) => a + imp(r), 0);
        o.DOL = sel.filter(r => r.proveedor === norm(regla.proveedores.DOL)).reduce((a, r) => a + imp(r), 0);
      }
      filas.push(o);
    });

    // Conceptos tipificados (código de egreso distinto de 0) que no caen en ningún renglón
    const sueltos = {};
    regsMes.forEach(r => {
      if (usados.has(r) || !r.codEgreso) return;
      const k = r.concepto;
      if (!sueltos[k]) sueltos[k] = { concepto: r.concepto, egreso: r.egreso, importe: 0, n: 0 };
      sueltos[k].importe += imp(r); sueltos[k].n++;
    });
    return {
      mes, importe: modo, filas, cantidad: regsMes.length,
      sueltos: Object.values(sueltos).sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe)),
    };
  }

  // Paso 2: reparte lo agrupado entre Casa Central y Dolores con las claves del mes.
  // Si falta una clave, esos renglones quedan en el total "sin repartir" y se informa en faltanClaves.
  function repartir(agrupado, claves) {
    const por = Object.fromEntries((agrupado.filas || []).map(f => [f.fila, f]));
    const faltanClaves = new Set();
    const filas = FILAS.map(([fila, area, label]) => {
      const regla = REGLAS[fila] || {};
      const fuente = regla.fuente || 'egresos';
      const o = { fila, area, label, fuente, regla, total: 0, CC: 0, DOL: 0, ivaExcluido: 0 };
      if (fuente !== 'egresos') return o;
      const g = por[fila] || { base: 0, iva: 0, CC: 0, DOL: 0 };
      o.total = g.base; o.ivaExcluido = g.iva;
      if (regla.masFN) {
        if (claves && claves.fnTotal) o.total += regla.masFN * claves.fnTotal;
        else faltanClaves.add('fnTotal');
      }
      const rep = regla.reparto || 'vol';
      if (rep === 'cc') o.CC = o.total;
      else if (rep === 'dol') o.DOL = o.total;
      else if (rep === 'mitad') o.CC = o.DOL = o.total / 2;
      else if (REPARTO_FIJO.includes(rep)) {
        o.CC = g.CC || 0; o.DOL = g.DOL || 0;
        if (rep === 'proveedor') o.otrosProveedores = o.total - o.CC - o.DOL;
      } else {
        const s = share(claves && claves[rep]);
        if (s == null) { if (o.total) { faltanClaves.add(rep); o.sinClave = true; } }
        else { o.CC = o.total * s; o.DOL = o.total * (1 - s); }
      }
      return o;
    });
    const areas = {};
    filas.forEach(f => {
      const a = areas[f.area] || (areas[f.area] = { area: f.area, total: 0, CC: 0, DOL: 0 });
      a.total += f.total; a.CC += f.CC; a.DOL += f.DOL;
    });
    const total = filas.reduce((a, f) => a + f.total, 0);
    const CC = filas.reduce((a, f) => a + f.CC, 0), DOL = filas.reduce((a, f) => a + f.DOL, 0);
    return {
      mes: agrupado.mes, filas, areas: Object.values(areas), total, CC, DOL,
      sinRepartir: total - CC - DOL,
      ivaExcluido: agrupado.importe === 'total' ? 0 : filas.reduce((a, f) => a + f.ivaExcluido, 0),
      sueltos: agrupado.sueltos || [],
      faltanClaves: [...faltanClaves],
      cantidad: agrupado.cantidad,
    };
  }

  // Atajo: agrupa y reparte en un paso
  function calcularMes(registros, mes, claves, opciones) {
    return repartir(agruparMes(registros, mes, opciones), claves);
  }

  const api = { FILAS, REGLAS, CLAVES, MESES, parsearEgresos, agruparMes, repartir, calcularMes, mesDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PresupuestoEgresos = api;
})(typeof window !== 'undefined' ? window : this);

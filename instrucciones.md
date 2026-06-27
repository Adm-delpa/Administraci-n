# Instrucciones de instalación — Sistema Del Palacio S.A.

## Archivos generados
```
administracion-delpa/
├── package.json
├── server.js
└── public/
    ├── index.html       ← login
    ├── panel.html       ← panel administrativo
    └── facturacion.html ← módulo facturación
```

---

## PASO 1 — Agregar PostgreSQL en Railway

1. Entrá a tu proyecto en Railway: https://railway.app
2. Hacé clic en **"+ New"** → **"Database"** → **"Add PostgreSQL"**
3. Esperá que se cree (unos segundos)
4. Ya está — Railway conecta la base de datos automáticamente con tu servicio

---

## PASO 2 — Subir los archivos al repositorio GitHub

Tenés dos opciones:

### Opción A — Desde la web de GitHub (más simple)
1. Entrá a https://github.com/adm-delpa/Administraci-n
2. Borrá el `index.html` actual (clic en el archivo → ícono papelera)
3. Hacé clic en **"Add file"** → **"Upload files"**
4. Subí estos archivos en la raíz:
   - `package.json`
   - `server.js`
5. Creá la carpeta `public` subiendo los archivos con la ruta `public/index.html`, `public/panel.html`, `public/facturacion.html`
   - Para crear carpetas en GitHub web: en el nombre del archivo escribís `public/index.html` y GitHub crea la carpeta sola

### Opción B — Desde terminal (si tenés Git instalado)
```bash
git clone https://github.com/adm-delpa/Administraci-n.git
# Copiás todos los archivos generados adentro
git add .
git commit -m "Sistema de gestión completo"
git push origin main
```

---

## PASO 3 — Configurar variable de entorno en Railway

Railway necesita saber en qué puerto correr el servidor:

1. En tu proyecto de Railway → clic en el servicio web
2. Ir a **"Variables"**
3. Verificar que exista `DATABASE_URL` (Railway la agrega sola al crear PostgreSQL)
4. Agregar: `NODE_ENV` = `production`

---

## PASO 4 — Verificar el deploy

1. Railway detecta el `package.json` y corre `npm start` automáticamente
2. En 1-2 minutos el deploy termina
3. Entrá a tu URL: https://administraci-n-production.up.railway.app/
4. Deberías ver la pantalla de login

---

## CREDENCIALES POR DEFECTO

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | admin2024 | Administrador |
| mario | mario2024 | Vista |

**⚠️ Importante:** Cambiá las contraseñas apenas entrés por primera vez.
Desde el panel → ícono de configuración → "Cambiar contraseña"

---

## FLUJO DE USO MENSUAL

1. Entrás con usuario `admin`
2. Vas al módulo **Facturación**
3. Pestaña **"Cargar datos"**
4. Elegís mes, año y estado (En curso / Completo)
5. Subís los 3 archivos de Chess ERP
6. Clic en **"Procesar y guardar período"**
7. Los datos quedan guardados en PostgreSQL — disponibles para todos los usuarios

---

## AGREGAR NUEVOS MÓDULOS EN EL FUTURO

1. Crear `public/nuevo-modulo.html` (mismo patrón que facturación)
2. Agregar ruta en `server.js`: `app.get('/nuevo-modulo', ...)`
3. Activar la tarjeta en `panel.html` (cambiar `coming-soon` por el link)
4. Subir al repositorio → Railway redespliega automáticamente


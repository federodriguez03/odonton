# Base de datos PostgreSQL - Odonton

## Estructura relacional

### Tablas principales:

- **users**: Usuario (odontólogo) con autenticación
- **patients**: Datos personales de pacientes
- **services**: Prestaciones dentales disponibles
- **appointments**: Turnos programados
- **treatments**: Tratamientos realizados
- **payments**: Pagos y cobros
- **odontograms**: Odontograma digital
- **consents**: Consentimientos informados
- **messages**: Recordatorios y comunicaciones

## Scripts de configuración

### Crear tablas:
```bash
npm run db:migrate
```

### Cargar datos de prueba:
```bash
npm run db:seed
```

## Credenciales de prueba (después de seed)

- Email: admin@odonton.com
- Contraseña: admin123

## Variables de entorno requeridas

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=odonton_db
DB_USER=postgres
DB_PASSWORD=tu_contraseña
```

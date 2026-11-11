# Sistema de Gestión de Prácticas Académicas

Aplicación web desarrollada como Proyecto Integrador de quinto semestre del programa de Ingeniería de Sistemas de la Universidad de Investigación y Desarrollo - UDI.

El sistema tiene como propósito centralizar y facilitar la gestión de las prácticas académicas, permitiendo administrar usuarios, prácticas, grupos, actividades de seguimiento y demás procesos asociados mediante funcionalidades diferenciadas de acuerdo con el rol del usuario.

---

## Descripción del proyecto

La gestión de prácticas académicas involucra información de estudiantes, docentes asesores, coordinadores, programas académicos, instituciones receptoras, grupos, actividades, evidencias y procesos de seguimiento.

El proyecto propone una aplicación web que permita centralizar esta información y reducir la dependencia de procesos manuales, archivos dispersos y herramientas independientes.

El sistema contempla tres roles principales:

- Coordinador de Prácticas
- Docente Asesor
- Estudiante

Cada rol dispone únicamente de las funcionalidades correspondientes a sus responsabilidades dentro del proceso académico.

---

## Arquitectura

La solución utiliza una arquitectura basada en frontend, API Gateway y microservicios.

```text
                         ┌─────────────────────┐
                         │       Angular       │
                         │       Web App       │
                         │        :4200        │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     API Gateway     │
                         │        :3333        │
                         └──────────┬──────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
                ▼                   ▼                   ▼
       ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
       │  User Service   │ │Practice Service │ │Activity Service │
       │      :3334      │ │      :3335      │ │      :3336      │
       └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                │                   │                   │
                └───────────────────┼───────────────────┘
                                    ▼
                       ┌─────────────────────────┐
                       │        Supabase         │
                       │ PostgreSQL + Auth       │
                       └─────────────────────────┘
```

### Componentes principales

| Componente | Responsabilidad | Puerto |
|---|---|---:|
| `web` | Interfaz de usuario Angular | 4200 |
| `api-gateway` | Punto de entrada, autenticación y autorización | 3333 |
| `user-service` | Gestión de usuarios, estudiantes y docentes | 3334 |
| `practice-service` | Gestión de prácticas y grupos | 3335 |
| `activity-service` | Gestión de actividades de seguimiento | 3336 |
| Supabase | Autenticación y base de datos PostgreSQL | Remoto |

---

## Tecnologías utilizadas

| Tecnología | Uso |
|---|---|
| Angular | Frontend |
| TypeScript | Lenguaje principal |
| Nx | Administración del monorepositorio |
| Node.js | Ejecución de servicios backend |
| Express | API REST y microservicios |
| PostgreSQL | Base de datos relacional |
| Supabase | PostgreSQL administrado y autenticación |
| `@supabase/supabase-js` | Integración con Supabase Auth |
| `pg` | Conexión de Node.js con PostgreSQL |
| pnpm | Gestión de dependencias |
| Git | Control de versiones |
| GitHub | Repositorio colaborativo |

El proyecto utiliza Angular 22 y Nx 23 dentro de un monorepositorio.

---

## Estructura del proyecto

```text
gestion-practicas-academicas/
│
├── apps/
│   ├── web/
│   ├── web-e2e/
│   │
│   ├── api-gateway/
│   ├── api-gateway-e2e/
│   │
│   ├── user-service/
│   ├── user-service-e2e/
│   │
│   ├── practice-service/
│   ├── practice-service-e2e/
│   │
│   ├── activity-service/
│   └── activity-service-e2e/
│
├── .env.example
├── .gitignore
├── nx.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md
```

---

## Base de datos

La base de datos está implementada en PostgreSQL mediante Supabase.

Para facilitar la separación lógica de la información se utilizan diferentes esquemas.

### Esquema `users`

```text
rol
usuario
estudiante
docente_asesor
```

Este esquema administra los usuarios de la aplicación y la información específica correspondiente a cada rol.

### Esquema `practices`

```text
programa
institucion
practica
grupo
grupo_estudiante
```

Este esquema contiene la información académica necesaria para administrar prácticas, instituciones y grupos.

### Esquema `activities`

```text
actividad
pregunta
```

Este esquema soporta la creación y administración de actividades de seguimiento asignadas por los docentes asesores.

La base de datos utiliza claves primarias, relaciones, claves foráneas, restricciones `UNIQUE`, restricciones `CHECK` y políticas de seguridad según las necesidades del sistema.

---

## Autenticación y autorización

La autenticación se realiza mediante Supabase Auth.

El frontend obtiene una sesión autenticada y envía el token JWT al API Gateway:

```text
Angular
   ↓
Supabase Auth
   ↓
JWT
   ↓
API Gateway
   ↓
Validación del usuario
   ↓
Validación del rol
   ↓
Microservicio correspondiente
```

El API Gateway cuenta con middlewares de autorización que permiten restringir las operaciones según el rol del usuario.

Ejemplos:

```text
COORDINADOR
→ Gestión de usuarios
→ Gestión de prácticas
→ Gestión de grupos

DOCENTE
→ Consulta de grupos asignados
→ Gestión de actividades de seguimiento

ESTUDIANTE
→ Funcionalidades correspondientes al seguimiento de su práctica
```

---

## Casos de uso

El sistema se encuentra organizado en ocho casos de uso principales.

| Código | Caso de uso | Actor principal | Estado |
|---|---|---|---|
| CU01 | Gestionar Usuarios | Coordinador | Implementado |
| CU02 | Gestionar Prácticas Académicas | Coordinador | Implementado |
| CU03 | Gestionar Grupos de Práctica | Coordinador | Implementado |
| CU04 | Administrar Actividades de Seguimiento | Docente Asesor | En integración |
| CU05 | Realizar Actividades y Evidencias | Estudiante | Pendiente |
| CU06 | Realizar Seguimiento de Prácticas | Docente / Coordinador | Pendiente |
| CU07 | Evaluar y Consultar Resultados | Docente / Estudiante | Pendiente |
| CU08 | Generar Reportes | Coordinador | Pendiente |

> Para el segundo avance del proyecto se contempla completar los primeros cuatro casos de uso, correspondientes al 50 % de los casos de uso definidos.

---

## Funcionalidades implementadas

### CU01 - Gestión de usuarios

Permite al Coordinador:

```text
Registrar usuarios
Consultar usuarios
Actualizar información
Activar o desactivar usuarios
Administrar estudiantes
Administrar docentes asesores
Validar información duplicada
```

### CU02 - Gestión de prácticas académicas

Permite:

```text
Crear prácticas
Consultar prácticas
Actualizar prácticas
Gestionar estado
Relacionar programa académico
Relacionar institución receptora
Definir periodo académico
Definir horas requeridas
```

### CU03 - Gestión de grupos

Permite:

```text
Crear grupos
Consultar grupos
Actualizar grupos
Cerrar grupos
Asignar Docente Asesor
Agregar estudiantes
Retirar estudiantes
Validar asignaciones incompatibles
Conservar información histórica
```

### CU04 - Actividades de seguimiento

El backend permite actualmente:

```text
Consultar grupos asignados al Docente
Crear actividades
Definir fecha y hora límite
Agregar múltiples preguntas
Consultar actividades
Consultar detalle de actividad
Actualizar actividades abiertas
Cerrar actividades
Impedir la modificación de actividades cerradas
Validar que el grupo pertenezca al docente
```

La interfaz Angular correspondiente al Docente Asesor se encuentra en proceso de integración.

---

## Requisitos para ejecutar el proyecto

Se requiere:

```text
Node.js
pnpm
Git
Acceso al proyecto Supabase
```

Instalar `pnpm` si no se encuentra disponible:

```bash
npm install -g pnpm
```

---

## Instalación

Clonar el repositorio:

```bash
git clone https://github.com/EnriquePinzon1/gestion-practicas-academicas.git
```

Ingresar al proyecto:

```bash
cd gestion-practicas-academicas
```

Instalar las dependencias:

```bash
pnpm install
```

---

## Variables de entorno

Crear el archivo `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

La estructura requerida es:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_URL=
```

Los valores reales deben configurarse de manera local.

> El archivo `.env` contiene información sensible y no debe almacenarse en GitHub.

---

## Ejecución del sistema

El sistema requiere ejecutar el frontend, el API Gateway y los tres microservicios.

### Frontend

```bash
pnpm nx serve web
```

Disponible en:

```text
http://localhost:4200
```

### API Gateway

Ubuntu/Linux:

```bash
PORT=3333 pnpm nx serve api-gateway
```

### User Service

```bash
PORT=3334 pnpm nx serve user-service
```

### Practice Service

```bash
PORT=3335 pnpm nx serve practice-service
```

### Activity Service

```bash
PORT=3336 pnpm nx serve activity-service
```

En Windows PowerShell se utiliza:

```powershell
$env:PORT=3333; pnpm nx serve api-gateway
$env:PORT=3334; pnpm nx serve user-service
$env:PORT=3335; pnpm nx serve practice-service
$env:PORT=3336; pnpm nx serve activity-service
```

---

## Verificación de servicios

Los servicios pueden comprobarse mediante:

```bash
curl http://localhost:3333/api
curl http://localhost:3334/api
curl http://localhost:3335/api
curl http://localhost:3336/api
```

La aplicación Angular debe encontrarse disponible en:

```text
http://localhost:4200
```

---

## Compilación

Los proyectos pueden compilarse individualmente:

```bash
pnpm nx build web
pnpm nx build api-gateway
pnpm nx build user-service
pnpm nx build practice-service
pnpm nx build activity-service
```

---

## Seguridad

El proyecto aplica diferentes mecanismos para proteger la información:

```text
Autenticación mediante Supabase Auth
Tokens JWT
Autorización basada en roles
API Gateway
Validación de usuarios activos
Restricción de funcionalidades según rol
Variables sensibles excluidas de Git
Restricciones de integridad en PostgreSQL
Row Level Security en las tablas configuradas
```

Las claves privadas y las credenciales de conexión nunca deben incluirse en el código fuente ni subirse al repositorio.

---

## Flujo de trabajo con Git

Antes de comenzar a trabajar:

```bash
git status
git fetch origin
git pull
pnpm install
```

El desarrollo de cada funcionalidad se realiza utilizando ramas independientes, por ejemplo:

```text
feature/cu03-grupos
feature/cu04-actividades
```

Una vez validada la funcionalidad, los cambios se integran a la rama principal.

---

## Estado del segundo avance

Para el segundo avance se encuentran funcionales:

```text
CU01 - Gestionar Usuarios
CU02 - Gestionar Prácticas Académicas
CU03 - Gestionar Grupos de Práctica
```

CU04 - Administrar Actividades de Seguimiento se encuentra en proceso de integración entre backend y frontend.

Al completar CU04, el prototipo tendrá implementados 4 de los 8 casos de uso definidos, correspondientes al 50 % solicitado para el segundo avance.

---

## Integrantes

**Brayan Enrique Pinzón Quiñonez**  
**William Fernando Vega Cordero**  
**Jorge Luis Osorio Páez**

Ingeniería de Sistemas - Quinto semestre  
Universidad de Investigación y Desarrollo - UDI  
Periodo académico 2026-2

---

## Proyecto académico

Este repositorio corresponde al desarrollo del Proyecto Integrador del quinto semestre de Ingeniería de Sistemas.

El sistema continúa en desarrollo y será ampliado en las siguientes etapas hasta completar los casos de uso, seguimiento académico, evaluaciones, evidencias y generación de reportes.

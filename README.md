WEB-BE1: Multi-Resource API with Roles & Concurrency Safety
A robust, production-grade Express.js backend engineered with TypeScript, Drizzle ORM, and PostgreSQL (Supabase). This application acts as a secure state engine and gatekeeper for a multi-resource event ticketing platform, featuring role-based access control, database-level concurrency safeguards, and pagination.

Key Features
Relational Schema: Structured with Drizzle ORM establishing explicit foreign key relationships between Users, Events, and Registrations (join table with cascade deletion).

Role-Based Access Control (RBAC): Supports admin and member roles. Sensitive mutations (such as event creation) are strictly protected by role-verification middleware.

Concurrency-Safe Ticketing: Eliminates race conditions (TOCTOU) during high-traffic event registrations by wrapping logic in database transactions with row-level locking (.for("update")).

Pagination & Query Limits: Event listing endpoints support scalable pagination queries (limit and page).

Secure Authentication: Stateless JWT-based authentication embedding user claims (userId, role) with secure password hashing via bcryptjs.

Tech Stack
Runtime: Node.js & TypeScript

Framework: Express.js

ORM: Drizzle ORM

Database: PostgreSQL (Supabase)

Validation: Zod

Security: JSON Web Tokens (JWT), bcryptjs

Project Architecture
Plaintext
src/
├── db/
│   ├── index.ts        # Database connection configuration
│   └── schema.ts       # Database tables & relational definitions
├── middleware/
│   └── auth.middleware.ts # JWT verification & RBAC role guards
├── routes/
│   ├── auth.ts         # Authentication (Register / Login)
│   └── events.ts       # Events management, pagination, & concurrency registration
└── schemas/
    └── event.schema.ts # Zod validation schemas
Getting Started & Installation
1. Clone the Repository
Bash
git clone <your-repository-link>
cd web-be1-api
2. Install Dependencies
Bash
npm install
3. Environment Configuration
Create a .env file in the root directory and configure your environment variables:

Code snippet
PORT=3000
DATABASE_URL=your_postgresql_connection_string_here
JWT_SECRET=your_super_secret_jwt_key
4. Run the Application
For development with hot-reloading:

Bash
npm run dev
For production build:

Bash
npm run build
npm start
Concurrency Design
To handle capacity-limited registrations safely under concurrent load, the registration endpoint (POST /api/events/:id/register) leverages PostgreSQL row-level locking:

Opens an isolated database transaction (db.transaction).

Fetches the target event row with an exclusive lock (.for("update")).

Validates capacity atomically within the locked scope to prevent overselling.

Inserts the registration and increments the counter safely.

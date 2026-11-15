# CLAUDE.md

# Zentro Backend — Claude Code Instructions

Read `AGENTS.md` first and follow its instructions before proceeding with any task.

## Project Overview

Zentro is an X-inspired social networking platform built with a modular backend architecture. The backend is designed around clear separation of responsibilities, maintainable business logic, database consistency, and scalable API development.

The project prioritizes:

- Modular architecture.
- Type-safe development.
- Secure authentication and authorization.
- Consistent database operations.
- Reliable automated testing.
- Maintainable business logic.

## Technology Stack

| Technology     | Purpose                                |
| -------------- | -------------------------------------- |
| Bun            | JavaScript runtime and package manager |
| TypeScript     | Application development                |
| RiserBob       | HTTP backend framework                 |
| PostgreSQL     | Relational database                    |
| Drizzle ORM    | Database queries and schema management |
| @riser-bob/jwt | JWT authentication                     |
| Bun Test       | Unit testing                           |
| Next.js        | Frontend application                   |

Always inspect the actual project dependencies and configuration before assuming a package or feature is available.

## Architecture

The backend follows a feature-oriented modular architecture.

Main source directory:

```text
src/
├── config/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── user-profiles/
│   ├── posts/
│   ├── comments/
│   ├── replies/
│   ├── notifications/
│   └── ...
└── ...
```

The structure above is representative. Inspect the repository for the complete and current module list.

### Architectural Responsibilities

**Controllers**

- Handle HTTP requests and responses.
- Extract authenticated user information.
- Validate and forward request data.
- Delegate business logic to services.

**Services**

- Implement business rules.
- Coordinate database operations.
- Enforce ownership and authorization rules.
- Manage transactions when necessary.

**Schemas**

- Define database structures using Drizzle ORM.
- Maintain relationships and constraints.
- Provide consistent types for database operations.

**Utilities**

- Contain reusable functionality.
- Avoid duplicating shared logic across modules.

## Development Standards

### TypeScript

- Use strict TypeScript.
- Never introduce `any`.
- Prefer inferred types and explicit domain types.
- Use `unknown` with proper narrowing when necessary.
- Avoid unnecessary type assertions.
- Keep interfaces and contracts consistent.

### Database Engineering

Zentro uses PostgreSQL with Drizzle ORM.

Follow these rules:

1. Use Drizzle query builders for database operations.
2. Use parameterized expressions such as `eq()` and `sql`.
3. Use transactions for operations that require atomicity.
4. Preserve database consistency when updating related records.
5. Handle ownership and relationship checks explicitly.
6. Avoid unnecessary database queries.
7. Preserve pagination behavior and deterministic ordering.
8. Handle unique constraint violations according to existing project conventions.

Example:

```ts
await db.transaction(async (transaction) => {
  // Related database operations
})
```

Never concatenate untrusted input into SQL statements.

### API Design

Follow existing RiserBob conventions.

Existing project patterns include:

- `SpongRequest`
- `SpongOK`
- `SpongBadRequest`
- RiserBob exception classes.

Preserve established response structures.

Common service response patterns include:

```ts
{
  success: true,
  message: 'Operation completed',
  data: result,
}
```

Paginated responses may follow:

```ts
{
  success: true,
  data: results,
  pagination,
}
```

Do not introduce inconsistent response formats without a clear reason.

### Authentication and Security

The backend uses JWT authentication through `@riser-bob/jwt`.

Known environment configuration includes:

```env
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
```

Known issuer and audience configuration has included:

```text
Issuer: zentro-api
Audience: zentro-client
```

Verify the actual configuration before modifying authentication behavior.

Security requirements:

- Never hardcode credentials.
- Never expose access or refresh tokens.
- Never trust client-supplied user IDs for authorization.
- Enforce ownership and permission checks.
- Validate untrusted input.
- Do not weaken authentication or authorization to satisfy tests.

## Testing Strategy

Zentro uses Bun's built-in test runner.

Run the complete test suite:

```bash
bun test
```

Run an individual test file:

```bash
bun test src/modules/comments/tests/comments.service.test.ts
```

### Testing Principles

- Test successful operations.
- Test missing resources.
- Test unauthorized operations.
- Test database failures.
- Test transaction behavior.
- Test important business invariants.
- Keep mocks consistent with actual execution order.

### Fake Database Testing

The current test infrastructure includes a `FakeDb` and `QueryChain` pattern.

Important behavior:

Every awaited query chain consumes one configured mock outcome.

For example:

```ts
db.setOutcomes([rows([comment]), rows([]), rows([])])
```

When modifying tests:

1. Count every awaited query.
2. Include queries executed inside transactions.
3. Account for conditional queries and loops.
4. Match mock outcomes to the exact execution sequence.
5. Never modify correct production logic simply to satisfy an incorrect mock.

## Performance and Maintainability

- Avoid unnecessary database round trips.
- Prefer efficient queries.
- Avoid loading unused columns.
- Keep transaction boundaries intentional.
- Avoid premature abstractions.
- Optimize only when there is a measurable reason.
- Preserve readability while improving performance.

## Working Rules for Claude

Before modifying anything:

1. Inspect the relevant module.
2. Read its service, controller, schemas, and tests.
3. Understand existing conventions.
4. Identify affected callers and dependencies.
5. Make the smallest complete change.

After modifying code:

1. Review the final diff.
2. Check TypeScript correctness.
3. Run relevant tests.
4. Run broader checks when appropriate.
5. Report exactly what was changed.
6. Report which commands were actually executed.
7. Clearly identify anything not verified.

## Important Restrictions

- Do not rewrite entire modules unnecessarily.
- Do not introduce `any`.
- Do not invent dependencies or environment variables.
- Do not silently change API contracts.
- Do not bypass validation or authorization.
- Do not claim tests passed without executing them.
- Do not introduce unrelated refactoring.

**Primary principle: Understand the existing implementation before changing it.**

# AGENTS.md

# Zentro — AI Agent Engineering Guidelines

## 1. Mission

You are working on Zentro, an X-inspired social networking platform.

Your responsibility is to maintain and improve the existing codebase while preserving its architectural consistency, security, correctness, and maintainability.

Treat this repository as an existing production-oriented project, not a blank template.

Never assume that a feature exists simply because it is described in documentation. Verify everything against the actual source code.

## 2. Core Technology Stack

### Backend

- Bun Runtime
- TypeScript
- LykosJS HTTP Framework
- PostgreSQL
- Drizzle ORM
- @riser-bob/jwt
- Bun Test

### Frontend

- Next.js
- TypeScript

Check the current package manifests before introducing or using dependencies.

## 3. Repository Architecture

The backend uses feature-based modular organization.

```text
backend/
└── src/
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

Follow the existing organization.

Do not introduce a new architecture or move modules unless the task requires it.

## 4. Engineering Principles

### Clean Responsibilities

Controllers should handle HTTP concerns.

Services should handle business logic.

Database schemas should define persistence structures.

Utilities should contain reusable logic.

Avoid mixing responsibilities or duplicating existing functionality.

### Type Safety

Mandatory rules:

- No `any`.
- Prefer explicit domain types.
- Use TypeScript inference where appropriate.
- Narrow `unknown` safely.
- Avoid unnecessary assertions.
- Preserve existing public interfaces.

### Database Consistency

Use Drizzle ORM and PostgreSQL.

Important requirements:

- Use parameterized queries.
- Use transactions for related operations requiring atomicity.
- Preserve relational integrity.
- Handle counters and dependent records consistently.
- Enforce ownership checks.
- Avoid unnecessary database queries.
- Maintain pagination correctness.
- Follow existing error-handling conventions.

Example:

```ts
await db.transaction(async (transaction) => {
  // Atomic business operation
})
```

Never use unsafe SQL concatenation with user input.

## 5. API Development

Use the existing LykosJS framework conventions.

Follow existing patterns for:

- Request handling.
- Route definitions.
- Controllers.
- Authentication guards.
- Validation.
- HTTP exceptions.
- Response serialization.

Do not invent APIs or framework methods. Inspect the installed LykosJS version and existing code before using unfamiliar methods.

Preserve established API response contracts.

## 6. Authentication and Authorization

Authentication is based on JWT.

Known configuration names:

```env
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
```

Known issuer/audience values have included:

```text
zentro-api
zentro-client
```

Verify the current implementation before changing token handling.

Security requirements:

- Never expose secrets.
- Never log authentication tokens.
- Never trust user identity from an arbitrary request body.
- Enforce resource ownership.
- Validate incoming data.
- Preserve authentication and authorization boundaries.

## 7. Testing

Use Bun Test.

Full suite:

```bash
bun test
```

Focused test:

```bash
bun test path/to/test-file.test.ts
```

### Required Test Coverage

When relevant, cover:

- Successful execution.
- Missing resources.
- Invalid input.
- Unauthorized access.
- Database failures.
- Transaction failures.
- Important business rules.
- Edge cases.

### Mocking Rules

The current fake database test pattern uses `FakeDb`, `QueryChain`, and configured `Outcome` values.

Each awaited query consumes one outcome.

Always trace the actual execution sequence before configuring mocks.

Do not add arbitrary mock results to silence failures.

A failing test does not automatically indicate a production bug. Determine whether the issue is in:

- Production implementation.
- Test expectations.
- Mock configuration.
- Test infrastructure.

Never change correct business logic just to make a test pass.

## 8. Performance

Performance improvements should be evidence-based.

Priorities:

1. Reduce unnecessary database operations.
2. Avoid fetching unused data.
3. Keep query patterns efficient.
4. Preserve atomicity.
5. Avoid unnecessary allocations and abstractions.
6. Measure before claiming improvements.

Do not sacrifice correctness or readability for speculative optimization.

## 9. Agent Workflow

For every task, follow this sequence:

### Step 1 — Inspect

- Identify the relevant files.
- Read the implementation.
- Read associated tests.
- Inspect callers and dependencies.

### Step 2 — Analyze

- Understand current behavior.
- Identify expected behavior.
- Identify edge cases.
- Determine the smallest safe solution.

### Step 3 — Implement

- Make focused changes.
- Preserve existing conventions.
- Avoid unrelated refactoring.
- Maintain strict TypeScript typing.

### Step 4 — Verify

- Run focused tests.
- Run relevant type checks or build scripts if available.
- Run broader tests when appropriate.
- Review the final diff.

### Step 5 — Report

Provide:

- Summary of changes.
- Files modified.
- Tests and commands executed.
- Actual results.
- Remaining risks or unverified behavior.

## 10. Forbidden Practices

Never:

- Introduce `any`.
- Invent project modules or dependencies.
- Invent environment variables.
- Hardcode credentials.
- Weaken authorization.
- Remove validation without justification.
- Change API response contracts unexpectedly.
- Rewrite unrelated files.
- Claim tests passed without execution.
- Claim performance improvements without measurements.
- Assume documentation is more accurate than the current source code.

## Final Rule

**Repository evidence comes first. Understand the code, preserve its contracts, make the smallest correct change, and verify the result.**

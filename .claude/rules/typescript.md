# TypeScript Conventions

## General

- Use `interface` for object shapes, `type` for unions/intersections
- Enable strict mode (already configured)
- Prefer `unknown` over `any` for truly dynamic types
- Use `const` assertions where appropriate

## Naming

- Interfaces: PascalCase (e.g., `ConnectionInfo`)
- Types: PascalCase (e.g., `QueryResult`)
- Type parameters: Single uppercase letter or descriptive PascalCase (e.g., `T` or `TData`)

## Examples

```typescript
// Good
interface User {
  id: string;
  email: string;
}

type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// Bad
interface user {
  // Should be PascalCase
  id: any; // Should have specific type
}
```

## API Contracts

- Define request/response types in `src/shared/contracts.ts`
- Use Zod or JSON schema for runtime validation
- Export types for use in both frontend and backend

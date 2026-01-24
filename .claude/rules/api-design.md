# API Design Conventions

## RESTful Patterns

- `GET /api/connections` - List connections
- `POST /api/connections` - Create connection
- `GET /api/connections/:id` - Get connection
- `PUT /api/connections/:id` - Update connection
- `DELETE /api/connections/:id` - Delete connection

## Request/Response

```typescript
// Define in src/shared/contracts.ts

export interface CreateConnectionRequest {
  name: string;
  host: string;
  port: number;
  database?: string;
  username?: string;
}

export interface ConnectionResponse {
  id: string;
  name: string;
  host: string;
  port: number;
  database?: string;
  username?: string;
  isConnected: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
}
```

## Error Handling

```typescript
// Standard error response
{
  error: 'ValidationError',
  message: 'Invalid email format',
  statusCode: 400,
  details?: { ... }  // Optional additional context
}
```

## Validation

- Use Fastify schema validation
- Validate all inputs
- Return 400 for validation errors
- Return 404 for not found
- Return 500 for server errors

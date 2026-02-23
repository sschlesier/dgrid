# API Design Conventions

## Tauri IPC Commands

All backend functionality is exposed via Tauri commands (IPC), not REST endpoints.

### Command Naming

- `list_connections` - List all connections
- `get_connection` - Get a single connection
- `create_connection` - Create a new connection
- `update_connection` - Update an existing connection
- `delete_connection` - Delete a connection
- `execute_query` - Run a parsed query
- `cancel_query` - Cancel a running query

### Request/Response Types

```typescript
// Define in src/lib/contracts.ts (single source of truth)
// Rust structs in src-tauri/ mirror these interfaces via serde

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

### Frontend Usage

```typescript
import { invoke } from '@tauri-apps/api/core';

// All API calls use invoke()
const connections = await invoke<ConnectionResponse[]>('list_connections');
```

### Error Handling

Tauri commands return `Result<T, DgridError>`. Errors are serialized as strings by Tauri's IPC layer. The frontend `wrapInvokeError()` in `client.ts` converts them to typed `ApiError` instances.

### Validation

- Validate inputs in Rust command handlers
- Use `DgridError::Validation` for input errors
- Use `DgridError::NotFound` for missing resources
- Frontend-side query parsing catches syntax errors before IPC

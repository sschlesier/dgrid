# Testing Conventions

## File Organization

- Backend tests: `src/backend/__tests__/{module}.test.ts`
- Frontend tests: `src/frontend/src/__tests__/{component}.test.ts`
- Integration tests: `tests/integration/{feature}.test.ts`

## Structure

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('creates user with valid data', async () => {
      // Arrange
      const userData = { email: 'test@example.com' };

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result).toMatchObject({ email: 'test@example.com' });
    });

    it('throws error for invalid email', async () => {
      // ...
    });
  });
});
```

## Best Practices

- Test behavior, not implementation
- Use meaningful test names (what is being tested, what is expected)
- One assertion per test when possible
- Setup/teardown in beforeEach/afterEach
- Use mongodb-memory-server for database tests
- Mock external dependencies

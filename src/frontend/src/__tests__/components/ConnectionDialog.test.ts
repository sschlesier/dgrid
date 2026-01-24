import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ConnectionDialog from '../../components/ConnectionDialog.svelte';
import { createMockConnection } from '../test-utils';

// Mock the stores and API
vi.mock('../../stores/app.svelte', () => ({
  appStore: {
    connections: [],
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    deleteConnection: vi.fn(),
  },
}));

vi.mock('../../api/client', () => ({
  testConnection: vi.fn(),
}));

import { appStore } from '../../stores/app.svelte';
import * as api from '../../api/client';

describe('ConnectionDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (appStore as { connections: unknown[] }).connections = [];
  });

  describe('form field rendering', () => {
    it('renders all required form fields', () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Host/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Port/)).toBeInTheDocument();
    });

    it('renders optional form fields', () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      expect(screen.getByLabelText('Database')).toBeInTheDocument();
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('displays "New Connection" title for new connection', () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      expect(screen.getByText('New Connection')).toBeInTheDocument();
    });

    it('displays "Edit Connection" title for existing connection', () => {
      const connection = createMockConnection({ id: 'conn-1', name: 'Test' });
      (appStore as { connections: unknown[] }).connections = [connection];

      render(ConnectionDialog, {
        props: { connectionId: 'conn-1', onClose: mockOnClose },
      });

      expect(screen.getByText('Edit Connection')).toBeInTheDocument();
    });

    it('pre-fills form with existing connection data', async () => {
      const connection = createMockConnection({
        id: 'conn-1',
        name: 'Test Connection',
        host: '192.168.1.100',
        port: 27018,
        database: 'mydb',
        username: 'testuser',
      });
      (appStore as { connections: unknown[] }).connections = [connection];

      render(ConnectionDialog, {
        props: { connectionId: 'conn-1', onClose: mockOnClose },
      });

      // Wait for the effect to run
      await vi.waitFor(() => {
        expect(screen.getByDisplayValue('Test Connection')).toBeInTheDocument();
      });
      expect(screen.getByDisplayValue('192.168.1.100')).toBeInTheDocument();
      expect(screen.getByDisplayValue('27018')).toBeInTheDocument();
      expect(screen.getByDisplayValue('mydb')).toBeInTheDocument();
      expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
    });

    it('shows Auth Source field when username is provided', async () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      // Initially, Auth Source should not be visible
      expect(screen.queryByLabelText('Auth Source')).not.toBeInTheDocument();

      // Enter a username
      const usernameInput = screen.getByLabelText('Username');
      await fireEvent.input(usernameInput, { target: { value: 'testuser' } });

      // Auth Source should now be visible
      expect(screen.getByLabelText('Auth Source')).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('disables Save button when name is empty', () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      const saveButton = screen.getByText('Save');
      expect(saveButton).toBeDisabled();
    });

    it('disables Test Connection button when form is invalid', () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      const testButton = screen.getByText('Test Connection');
      expect(testButton).toBeDisabled();
    });

    it('enables buttons when required fields are filled', async () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      // Fill in required fields
      const nameInput = screen.getByLabelText(/Name/);
      await fireEvent.input(nameInput, { target: { value: 'My Connection' } });

      const saveButton = screen.getByText('Save');
      expect(saveButton).not.toBeDisabled();

      const testButton = screen.getByText('Test Connection');
      expect(testButton).not.toBeDisabled();
    });
  });

  describe('test connection flow', () => {
    it('shows "Testing..." when test is in progress', async () => {
      (api.testConnection as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      // Fill in required fields
      const nameInput = screen.getByLabelText(/Name/);
      await fireEvent.input(nameInput, { target: { value: 'Test' } });

      const testButton = screen.getByText('Test Connection');
      await fireEvent.click(testButton);

      expect(screen.getByText('Testing...')).toBeInTheDocument();
    });

    it('shows success message on successful test', async () => {
      (api.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        message: 'Connection successful!',
      });

      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      // Fill in required fields
      const nameInput = screen.getByLabelText(/Name/);
      await fireEvent.input(nameInput, { target: { value: 'Test' } });

      const testButton = screen.getByText('Test Connection');
      await fireEvent.click(testButton);

      // Wait for async operation
      await vi.waitFor(() => {
        expect(screen.getByText('Connection successful!')).toBeInTheDocument();
      });
    });

    it('shows error message on failed test', async () => {
      (api.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        message: 'Connection refused',
      });

      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      // Fill in required fields
      const nameInput = screen.getByLabelText(/Name/);
      await fireEvent.input(nameInput, { target: { value: 'Test' } });

      const testButton = screen.getByText('Test Connection');
      await fireEvent.click(testButton);

      await vi.waitFor(() => {
        expect(screen.getByText('Connection refused')).toBeInTheDocument();
      });
    });
  });

  describe('save and delete operations', () => {
    it('calls createConnection for new connection', async () => {
      (appStore.createConnection as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      // Fill in required fields
      const nameInput = screen.getByLabelText(/Name/);
      await fireEvent.input(nameInput, { target: { value: 'New Connection' } });

      const saveButton = screen.getByText('Save');
      await fireEvent.click(saveButton);

      await vi.waitFor(() => {
        expect(appStore.createConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Connection',
            host: 'localhost',
            port: 27017,
          })
        );
      });
    });

    it('calls updateConnection for existing connection', async () => {
      const connection = createMockConnection({ id: 'conn-1', name: 'Old Name' });
      (appStore as { connections: unknown[] }).connections = [connection];
      (appStore.updateConnection as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(ConnectionDialog, {
        props: { connectionId: 'conn-1', onClose: mockOnClose },
      });

      // Change name
      const nameInput = screen.getByDisplayValue('Old Name');
      await fireEvent.input(nameInput, { target: { value: 'New Name' } });

      const saveButton = screen.getByText('Save');
      await fireEvent.click(saveButton);

      await vi.waitFor(() => {
        expect(appStore.updateConnection).toHaveBeenCalledWith(
          'conn-1',
          expect.objectContaining({ name: 'New Name' })
        );
      });
    });

    it('shows Delete button for existing connection', () => {
      const connection = createMockConnection({ id: 'conn-1' });
      (appStore as { connections: unknown[] }).connections = [connection];

      render(ConnectionDialog, {
        props: { connectionId: 'conn-1', onClose: mockOnClose },
      });

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('hides Delete button for new connection', () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('closes dialog after successful save', async () => {
      (appStore.createConnection as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      const nameInput = screen.getByLabelText(/Name/);
      await fireEvent.input(nameInput, { target: { value: 'Test' } });

      const saveButton = screen.getByText('Save');
      await fireEvent.click(saveButton);

      await vi.waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('dialog interactions', () => {
    it('closes when Cancel button is clicked', async () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      const cancelButton = screen.getByText('Cancel');
      await fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('closes when close icon is clicked', async () => {
      render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      const closeButton = screen.getByTitle('Close');
      await fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('closes when overlay is clicked', async () => {
      const { container } = render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      const overlay = container.querySelector('.dialog-overlay');
      await fireEvent.click(overlay!);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not close when dialog content is clicked', async () => {
      const { container } = render(ConnectionDialog, {
        props: { connectionId: null, onClose: mockOnClose },
      });

      const dialog = container.querySelector('.dialog');
      await fireEvent.click(dialog!);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });
});

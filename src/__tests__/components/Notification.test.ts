import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Notification from '../../components/Notification.svelte';
import { createMockNotification } from '../test-utils';

// Mock the appStore
vi.mock('../../stores/app.svelte', () => ({
  appStore: {
    dismiss: vi.fn(),
  },
}));

import { appStore } from '../../stores/app.svelte';

describe('Notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('icon display', () => {
    it('displays checkmark icon for success type', () => {
      const notification = createMockNotification({ type: 'success' });

      render(Notification, { props: { notification } });

      const icon = screen.getByText('✓');
      expect(icon).toBeInTheDocument();
    });

    it('displays X icon for error type', () => {
      const notification = createMockNotification({ type: 'error' });

      render(Notification, { props: { notification } });

      const icon = screen.getByText('✕');
      expect(icon).toBeInTheDocument();
    });

    it('displays warning icon for warning type', () => {
      const notification = createMockNotification({ type: 'warning' });

      render(Notification, { props: { notification } });

      const icon = screen.getByText('⚠');
      expect(icon).toBeInTheDocument();
    });

    it('displays info icon for info type', () => {
      const notification = createMockNotification({ type: 'info' });

      render(Notification, { props: { notification } });

      const icon = screen.getByText('ℹ');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('message display', () => {
    it('displays the notification message', () => {
      const notification = createMockNotification({
        message: 'Operation completed successfully',
      });

      render(Notification, { props: { notification } });

      expect(screen.getByText('Operation completed successfully')).toBeInTheDocument();
    });

    it('displays long messages', () => {
      const longMessage =
        'This is a very long notification message that should still be displayed correctly in the notification component.';
      const notification = createMockNotification({ message: longMessage });

      render(Notification, { props: { notification } });

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });
  });

  describe('type styling', () => {
    it('applies success class for success type', () => {
      const notification = createMockNotification({ type: 'success' });

      const { container } = render(Notification, { props: { notification } });

      const notificationEl = container.querySelector('.notification');
      expect(notificationEl).toHaveClass('success');
    });

    it('applies error class for error type', () => {
      const notification = createMockNotification({ type: 'error' });

      const { container } = render(Notification, { props: { notification } });

      const notificationEl = container.querySelector('.notification');
      expect(notificationEl).toHaveClass('error');
    });

    it('applies warning class for warning type', () => {
      const notification = createMockNotification({ type: 'warning' });

      const { container } = render(Notification, { props: { notification } });

      const notificationEl = container.querySelector('.notification');
      expect(notificationEl).toHaveClass('warning');
    });

    it('applies info class for info type', () => {
      const notification = createMockNotification({ type: 'info' });

      const { container } = render(Notification, { props: { notification } });

      const notificationEl = container.querySelector('.notification');
      expect(notificationEl).toHaveClass('info');
    });
  });

  describe('close button', () => {
    it('renders close button', () => {
      const notification = createMockNotification();

      render(Notification, { props: { notification } });

      const closeButton = screen.getByTitle('Dismiss');
      expect(closeButton).toBeInTheDocument();
    });

    it('calls appStore.dismiss when close button is clicked', async () => {
      const notification = createMockNotification({ id: 'test-notif-123' });

      render(Notification, { props: { notification } });

      const closeButton = screen.getByTitle('Dismiss');
      await fireEvent.click(closeButton);

      expect(appStore.dismiss).toHaveBeenCalledWith('test-notif-123');
    });
  });

  describe('structure', () => {
    it('renders all expected elements', () => {
      const notification = createMockNotification({
        type: 'success',
        message: 'Test message',
      });

      const { container } = render(Notification, { props: { notification } });

      // Main container
      expect(container.querySelector('.notification')).toBeInTheDocument();

      // Icon
      expect(container.querySelector('.notification-icon')).toBeInTheDocument();

      // Message
      expect(container.querySelector('.notification-message')).toBeInTheDocument();

      // Close button
      expect(container.querySelector('.notification-close')).toBeInTheDocument();
    });
  });
});

<script lang="ts">
  import type { Notification as NotificationType } from '../types';
  import { appStore } from '../stores/app.svelte';

  interface Props {
    notification: NotificationType;
  }

  let { notification }: Props = $props();

  function getIcon(): string {
    switch (notification.type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
    }
  }
</script>

<div class="notification {notification.type}">
  <span class="notification-icon">{getIcon()}</span>
  <span class="notification-message">{notification.message}</span>
  <button
    class="notification-close"
    onclick={() => appStore.dismiss(notification.id)}
    title="Dismiss"
  >
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <path
        d="M4 4L10 10M10 4L4 10"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
      />
    </svg>
  </button>
</div>

<style>
  .notification {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    font-size: var(--font-size-sm);
    max-width: 400px;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .notification.success {
    background-color: var(--color-success-light);
    color: var(--color-success-text);
    border: 1px solid var(--color-success);
  }

  .notification.error {
    background-color: var(--color-error-light);
    color: var(--color-error-text);
    border: 1px solid var(--color-error);
  }

  .notification.warning {
    background-color: var(--color-warning-light);
    color: var(--color-warning-text);
    border: 1px solid var(--color-warning);
  }

  .notification.info {
    background-color: var(--color-info-light);
    color: var(--color-info-text);
    border: 1px solid var(--color-info);
  }

  .notification-icon {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  .notification-message {
    flex: 1;
    line-height: var(--line-height-tight);
  }

  .notification-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    opacity: 0.7;
    transition: opacity var(--transition-fast);
  }

  .notification-close:hover {
    opacity: 1;
  }
</style>

<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    color?: string;
  }

  let { size = 'md', color }: Props = $props();
</script>

<span
  class="spinner spinner-{size}"
  style={color ? `border-top-color: ${color}; border-right-color: ${color}` : ''}
  role="status"
  aria-label="Loading"
></span>

<style>
  .spinner {
    display: inline-block;
    border-radius: 50%;
    border-style: solid;
    border-color: transparent;
    border-top-color: currentColor;
    border-right-color: currentColor;
    animation: spin 0.75s linear infinite;
    vertical-align: middle;
  }

  .spinner-sm {
    width: 12px;
    height: 12px;
    border-width: 2px;
  }

  .spinner-md {
    width: 18px;
    height: 18px;
    border-width: 2px;
  }

  .spinner-lg {
    width: 28px;
    height: 28px;
    border-width: 3px;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>

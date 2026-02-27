import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import GridPagination from '../../components/grid/GridPagination.svelte';

describe('GridPagination', () => {
  describe('document range display', () => {
    it('displays "0 documents" when docCount is 0', () => {
      render(GridPagination, {
        props: {
          docCount: 0,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.getByText('0 documents')).toBeInTheDocument();
    });

    it('displays range "Docs 1–50" for first page with 50 docs', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      expect(screen.getByText('Docs 1–50')).toBeInTheDocument();
    });

    it('displays range "Docs 51–100" for second page with 50 docs', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 2,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.getByText('Docs 51–100')).toBeInTheDocument();
    });

    it('displays partial page range correctly', () => {
      render(GridPagination, {
        props: {
          docCount: 10,
          page: 3,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.getByText('Docs 101–110')).toBeInTheDocument();
    });
  });

  describe('page size selector', () => {
    it('is hidden when on first page with no more results', () => {
      render(GridPagination, {
        props: {
          docCount: 30,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.queryByLabelText('Per page:')).not.toBeInTheDocument();
    });

    it('is visible when hasMore is true', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      expect(screen.getByText('Per page:')).toBeInTheDocument();
    });

    it('is visible when on page > 1', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 2,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.getByText('Per page:')).toBeInTheDocument();
    });

    it('displays all page size options', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      const options = select.querySelectorAll('option');
      expect(options).toHaveLength(4);
      expect(options[0]).toHaveValue('50');
      expect(options[1]).toHaveValue('100');
      expect(options[2]).toHaveValue('250');
      expect(options[3]).toHaveValue('500');
    });

    it('calls onpagesizechange when page size changes', async () => {
      const onpagesizechange = vi.fn();

      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
          onpagesizechange,
        },
      });

      const select = screen.getByRole('combobox');
      await fireEvent.change(select, { target: { value: '100' } });

      expect(onpagesizechange).toHaveBeenCalledWith(100);
    });
  });

  describe('navigation buttons', () => {
    it('hides navigation when on first page with no more results', () => {
      render(GridPagination, {
        props: {
          docCount: 30,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.queryByTitle('Previous page')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Next page')).not.toBeInTheDocument();
    });

    it('shows navigation when hasMore is true', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      expect(screen.getByTitle('Previous page')).toBeInTheDocument();
      expect(screen.getByTitle('Next page')).toBeInTheDocument();
    });

    it('shows navigation when on page > 1', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 2,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.getByTitle('Previous page')).toBeInTheDocument();
      expect(screen.getByTitle('Next page')).toBeInTheDocument();
    });

    it('disables Previous button on first page', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      const prevButton = screen.getByTitle('Previous page');
      expect(prevButton).toBeDisabled();
    });

    it('enables Previous button on page > 1', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 2,
          pageSize: 50,
          hasMore: false,
        },
      });

      const prevButton = screen.getByTitle('Previous page');
      expect(prevButton).not.toBeDisabled();
    });

    it('disables Next button when hasMore is false', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 2,
          pageSize: 50,
          hasMore: false,
        },
      });

      const nextButton = screen.getByTitle('Next page');
      expect(nextButton).toBeDisabled();
    });

    it('enables Next button when hasMore is true', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      const nextButton = screen.getByTitle('Next page');
      expect(nextButton).not.toBeDisabled();
    });

    it('displays page number without total', () => {
      render(GridPagination, {
        props: {
          docCount: 50,
          page: 3,
          pageSize: 50,
          hasMore: true,
        },
      });

      expect(screen.getByText('Page 3')).toBeInTheDocument();
    });
  });

  describe('navigation callbacks', () => {
    it('calls onpagechange with previous page when Previous clicked', async () => {
      const onpagechange = vi.fn();

      render(GridPagination, {
        props: {
          docCount: 50,
          page: 2,
          pageSize: 50,
          hasMore: false,
          onpagechange,
        },
      });

      const prevButton = screen.getByTitle('Previous page');
      await fireEvent.click(prevButton);

      expect(onpagechange).toHaveBeenCalledWith(1);
    });

    it('calls onpagechange with next page when Next clicked', async () => {
      const onpagechange = vi.fn();

      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
          onpagechange,
        },
      });

      const nextButton = screen.getByTitle('Next page');
      await fireEvent.click(nextButton);

      expect(onpagechange).toHaveBeenCalledWith(2);
    });

    it('does not call onpagechange when Previous is disabled', async () => {
      const onpagechange = vi.fn();

      render(GridPagination, {
        props: {
          docCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: true,
          onpagechange,
        },
      });

      const prevButton = screen.getByTitle('Previous page');
      await fireEvent.click(prevButton);

      expect(onpagechange).not.toHaveBeenCalled();
    });

    it('does not call onpagechange when Next is disabled', async () => {
      const onpagechange = vi.fn();

      render(GridPagination, {
        props: {
          docCount: 50,
          page: 2,
          pageSize: 50,
          hasMore: false,
          onpagechange,
        },
      });

      const nextButton = screen.getByTitle('Next page');
      await fireEvent.click(nextButton);

      expect(onpagechange).not.toHaveBeenCalled();
    });
  });
});

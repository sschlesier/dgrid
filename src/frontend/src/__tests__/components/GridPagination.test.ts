import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import GridPagination from '../../components/grid/GridPagination.svelte';

describe('GridPagination', () => {
  describe('document count display', () => {
    it('displays singular "document" for count of 1', () => {
      render(GridPagination, {
        props: {
          totalCount: 1,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.getByText('1 document')).toBeInTheDocument();
    });

    it('displays plural "documents" for count > 1', () => {
      render(GridPagination, {
        props: {
          totalCount: 100,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      expect(screen.getByText('100 documents')).toBeInTheDocument();
    });

    it('displays zero documents correctly', () => {
      render(GridPagination, {
        props: {
          totalCount: 0,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.getByText('0 documents')).toBeInTheDocument();
    });

    it('formats large numbers with locale separators', () => {
      render(GridPagination, {
        props: {
          totalCount: 1000000,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      // Locale-formatted number (e.g., 1,000,000)
      expect(screen.getByText(/1,000,000 documents/)).toBeInTheDocument();
    });
  });

  describe('page size selector', () => {
    it('is hidden when totalCount <= 50', () => {
      render(GridPagination, {
        props: {
          totalCount: 50,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.queryByLabelText('Per page:')).not.toBeInTheDocument();
    });

    it('is visible when totalCount > 50', () => {
      render(GridPagination, {
        props: {
          totalCount: 100,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      expect(screen.getByText('Per page:')).toBeInTheDocument();
    });

    it('displays all page size options', () => {
      render(GridPagination, {
        props: {
          totalCount: 1000,
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
          totalCount: 1000,
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
    it('hides navigation when totalPages is 1', () => {
      render(GridPagination, {
        props: {
          totalCount: 30,
          page: 1,
          pageSize: 50,
          hasMore: false,
        },
      });

      expect(screen.queryByTitle('Previous page')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Next page')).not.toBeInTheDocument();
    });

    it('shows navigation when totalPages > 1', () => {
      render(GridPagination, {
        props: {
          totalCount: 100,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      expect(screen.getByTitle('Previous page')).toBeInTheDocument();
      expect(screen.getByTitle('Next page')).toBeInTheDocument();
    });

    it('disables Previous button on first page', () => {
      render(GridPagination, {
        props: {
          totalCount: 100,
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
          totalCount: 100,
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
          totalCount: 100,
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
          totalCount: 100,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      const nextButton = screen.getByTitle('Next page');
      expect(nextButton).not.toBeDisabled();
    });

    it('displays page info correctly', () => {
      render(GridPagination, {
        props: {
          totalCount: 100,
          page: 1,
          pageSize: 50,
          hasMore: true,
        },
      });

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });

  describe('navigation callbacks', () => {
    it('calls onpagechange with previous page when Previous clicked', async () => {
      const onpagechange = vi.fn();

      render(GridPagination, {
        props: {
          totalCount: 100,
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
          totalCount: 100,
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
          totalCount: 100,
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
          totalCount: 100,
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

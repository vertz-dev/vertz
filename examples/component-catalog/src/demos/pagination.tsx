import { Pagination } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function PaginationDemo() {
  function handlePageChange(_page: number) {
    // no-op for demo
  }

  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <Pagination totalPages={10} currentPage={1} onPageChange={handlePageChange} />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Middle page</div>
        <Pagination totalPages={10} currentPage={5} onPageChange={handlePageChange} />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Last page</div>
        <Pagination totalPages={10} currentPage={10} onPageChange={handlePageChange} />
      </div>
    </div>
  );
}

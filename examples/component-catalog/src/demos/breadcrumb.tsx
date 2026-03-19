import { Breadcrumb } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function BreadcrumbDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Components', href: '/components' },
            { label: 'Breadcrumb' },
          ]}
        />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Two levels</div>
        <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Settings' }]} />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Deep nesting</div>
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Projects', href: '/projects' },
            { label: 'Vertz', href: '/projects/vertz' },
            { label: 'Settings', href: '/projects/vertz/settings' },
            { label: 'Members' },
          ]}
        />
      </div>
    </div>
  );
}

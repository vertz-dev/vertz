import { Breadcrumb } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function BreadcrumbDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <Breadcrumb>
          <Breadcrumb.Item href="/">Home</Breadcrumb.Item>
          <Breadcrumb.Item href="/components">Components</Breadcrumb.Item>
          <Breadcrumb.Item current>Breadcrumb</Breadcrumb.Item>
        </Breadcrumb>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Two levels</div>
        <Breadcrumb>
          <Breadcrumb.Item href="/">Dashboard</Breadcrumb.Item>
          <Breadcrumb.Item current>Settings</Breadcrumb.Item>
        </Breadcrumb>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Deep nesting</div>
        <Breadcrumb>
          <Breadcrumb.Item href="/">Home</Breadcrumb.Item>
          <Breadcrumb.Item href="/projects">Projects</Breadcrumb.Item>
          <Breadcrumb.Item href="/projects/vertz">Vertz</Breadcrumb.Item>
          <Breadcrumb.Item href="/projects/vertz/settings">Settings</Breadcrumb.Item>
          <Breadcrumb.Item current>Members</Breadcrumb.Item>
        </Breadcrumb>
      </div>
    </div>
  );
}

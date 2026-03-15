import { useRouter } from '@vertz/ui';
import { categoryLabels, categoryOrder, componentRegistry, groupByCategory } from '../demos';
import { homeStyles } from '../styles/catalog';

export function HomePage() {
  const grouped = groupByCategory(componentRegistry);
  const router = useRouter();

  return (
    <div>
      <h1 className={homeStyles.title}>Component Catalog</h1>
      <p className={homeStyles.subtitle}>
        {componentRegistry.length} themed components from @vertz/theme-shadcn
      </p>
      <div className={homeStyles.grid}>
        {categoryOrder.map((cat) => {
          const entries = grouped.get(cat) ?? [];
          return (
            <div
              key={cat}
              className={homeStyles.categoryCard}
              onClick={() => {
                if (entries.length > 0) {
                  router.navigate({
                    to: `/${entries[0].slug}` as Parameters<typeof router.navigate>[0]['to'],
                  });
                }
              }}
            >
              <div className={homeStyles.categoryName}>{categoryLabels[cat]}</div>
              <div className={homeStyles.categoryCount}>{entries.length} components</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

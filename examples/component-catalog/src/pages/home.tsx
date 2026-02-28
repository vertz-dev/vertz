import { useRouter } from '@vertz/ui';
import {
  categoryLabels,
  categoryOrder,
  componentRegistry,
  groupByCategory,
} from '../demos';
import { homeStyles } from '../styles/catalog';

export function HomePage() {
  const grouped = groupByCategory(componentRegistry);
  const router = useRouter();

  return (
    <div>
      <h1 class={homeStyles.title}>Component Catalog</h1>
      <p class={homeStyles.subtitle}>
        {componentRegistry.length} themed components from @vertz/theme-shadcn
      </p>
      <div class={homeStyles.grid}>
        {categoryOrder.map((cat) => {
          const entries = grouped.get(cat) ?? [];
          return (
            <div
              key={cat}
              class={homeStyles.categoryCard}
              onClick={() => {
                if (entries.length > 0) {
                  router.navigate(`/${entries[0].slug}` as any);
                }
              }}
            >
              <div class={homeStyles.categoryName}>{categoryLabels[cat]}</div>
              <div class={homeStyles.categoryCount}>{entries.length} components</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { ScrollArea, Separator } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

const tags = Array.from({ length: 50 }, (_, i) => `v1.${i}.0`);

export function ScrollAreaDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div
          style={{
            height: '18rem',
            width: '14rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <ScrollArea>
            <div style={{ padding: '1rem' }}>
              <h4
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  margin: '0 0 1rem',
                  color: 'var(--color-foreground)',
                }}
              >
                Tags
              </h4>
              {tags.map((tag) => (
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      padding: '0.375rem 0',
                      color: 'var(--color-foreground)',
                    }}
                  >
                    {tag}
                  </div>
                  <Separator />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

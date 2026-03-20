import { Carousel } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function CarouselDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div style={{ maxWidth: '24rem' }}>
          <Carousel>
            <Carousel.Slide>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '12rem',
                  background: 'var(--color-muted)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  color: 'var(--color-muted-foreground)',
                }}
              >
                Slide 1
              </div>
            </Carousel.Slide>
            <Carousel.Slide>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '12rem',
                  background: 'var(--color-muted)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  color: 'var(--color-muted-foreground)',
                }}
              >
                Slide 2
              </div>
            </Carousel.Slide>
            <Carousel.Slide>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '12rem',
                  background: 'var(--color-muted)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  color: 'var(--color-muted-foreground)',
                }}
              >
                Slide 3
              </div>
            </Carousel.Slide>
            <Carousel.Previous />
            <Carousel.Next />
          </Carousel>
        </div>
      </div>
    </div>
  );
}

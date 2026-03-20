import { Carousel } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { carouselProps } from '../props/carousel-props';

export const description = 'A slideshow component for cycling through content.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Carousel>
          <Carousel.Slide>
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                background: 'var(--color-muted)',
                borderRadius: '8px',
              }}
            >
              Slide 1
            </div>
          </Carousel.Slide>
          <Carousel.Slide>
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                background: 'var(--color-muted)',
                borderRadius: '8px',
              }}
            >
              Slide 2
            </div>
          </Carousel.Slide>
          <Carousel.Slide>
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                background: 'var(--color-muted)',
                borderRadius: '8px',
              }}
            >
              Slide 3
            </div>
          </Carousel.Slide>
          <Carousel.Previous>Previous</Carousel.Previous>
          <Carousel.Next>Next</Carousel.Next>
        </Carousel>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Carousel } from '@vertz/ui/components';

<Carousel>
  <Carousel.Slide>Slide 1</Carousel.Slide>
  <Carousel.Slide>Slide 2</Carousel.Slide>
  <Carousel.Slide>Slide 3</Carousel.Slide>
  <Carousel.Previous>Previous</Carousel.Previous>
  <Carousel.Next>Next</Carousel.Next>
</Carousel>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={carouselProps} />
    </>
  );
}

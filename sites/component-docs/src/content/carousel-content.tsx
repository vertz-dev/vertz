import { Carousel } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { carouselProps } from '../props/carousel-props';
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
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Carousel } from 'vertz/components';

<Carousel>
  <Carousel.Slide>Slide 1</Carousel.Slide>
  <Carousel.Slide>Slide 2</Carousel.Slide>
  <Carousel.Slide>Slide 3</Carousel.Slide>
  <Carousel.Previous>Previous</Carousel.Previous>
  <Carousel.Next>Next</Carousel.Next>
</Carousel>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={carouselProps} />
    </>
  );
}

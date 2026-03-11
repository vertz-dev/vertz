import { describe, expect, it } from 'bun:test';
import { transformImages } from '../image-transform';

/**
 * Helper: run the image transform on source code.
 * Uses a mock processor that returns predictable paths.
 */
function transform(source: string, filePath = 'src/app.tsx') {
  return transformImages(source, filePath, {
    projectRoot: '/project',
    resolveImagePath: (src, _sourceFile) => `/project${src}`,
    getImageOutputPaths: (_sourcePath, width, _height, _quality, _fit) => ({
      webp1x: `/__vertz_img/photo-${width}w.webp`,
      webp2x: `/__vertz_img/photo-${width * 2}w.webp`,
      fallback: `/__vertz_img/photo-${width * 2}w.jpg`,
      fallbackType: 'image/jpeg',
    }),
  });
}

describe('Feature: Image build-time transform', () => {
  describe('Given <Image> with static string src="/public/photo.jpg"', () => {
    describe('When the transform runs', () => {
      it('Then replaces <Image> with <picture> containing <source> and <img>', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<picture>');
        expect(result.code).toContain('<source');
        expect(result.code).toContain('<img');
        expect(result.code).toContain('</picture>');
        expect(result.transformed).toBe(true);
      });

      it('Then sets type="image/webp" on the <source>', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('type="image/webp"');
      });

      it('Then preserves width, height, alt on the inner <img>', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('width="80"');
        expect(result.code).toContain('height="80"');
        expect(result.code).toContain('alt="Photo"');
      });

      it('Then applies class and style to the inner <img>', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" class="rounded" style="object-fit: cover" />;
}`;
        const result = transform(source);

        expect(result.code).toMatch(/<img[^>]*class="rounded"/);
        expect(result.code).toMatch(/<img[^>]*style="object-fit: cover"/);
      });

      it('Then applies pictureClass to the <picture> wrapper', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" pictureClass="wrapper" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<picture class="wrapper">');
      });

      it('Then applies loading and decoding defaults', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('loading="lazy"');
        expect(result.code).toContain('decoding="async"');
      });
    });
  });

  describe('Given <Image> with src={"/photo.jpg"} (JSX expression with string literal)', () => {
    describe('When the transform runs', () => {
      it('Then treats it as static and optimizes', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src={"/public/photo.jpg"} width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<picture>');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given <Image> with template literal src with no interpolation', () => {
    describe('When the transform runs', () => {
      it('Then treats it as static and optimizes', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src={\`/public/photo.jpg\`} width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<picture>');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given <Image> with dynamic src={variable}', () => {
    describe('When the transform runs', () => {
      it('Then leaves the <Image> call unchanged', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page({ url }: { url: string }) {
  return <Image src={url} width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<Image');
        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given <Image> with spread props', () => {
    describe('When the transform runs', () => {
      it('Then leaves the <Image> call unchanged (treated as dynamic)', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page(props: any) {
  return <Image {...props} />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<Image');
        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given import { Image as Img } from "@vertz/ui"', () => {
    describe('When <Img> is used with static src', () => {
      it('Then detects and optimizes the aliased component', () => {
        const source = `
import { Image as Img } from '@vertz/ui';

function Page() {
  return <Img src="/public/photo.jpg" width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<picture>');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given multiple <Image> elements in one file', () => {
    describe('When the transform runs', () => {
      it('Then replaces all static <Image> elements', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page({ url }: { url: string }) {
  return (
    <div>
      <Image src="/public/logo.png" width={120} height={40} alt="Logo" />
      <Image src={url} width={80} height={80} alt="Avatar" />
      <Image src="/public/hero.jpg" width={800} height={400} alt="Hero" />
    </div>
  );
}`;
        const result = transform(source);

        // Two static images should be replaced
        const pictureCount = (result.code.match(/<picture>/g) || []).length;
        expect(pictureCount).toBe(2);
        // Dynamic image should remain
        expect(result.code).toContain('<Image src={url}');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given <Image> with priority={true}', () => {
    describe('When the transform runs', () => {
      it('Then sets loading="eager", decoding="sync", fetchpriority="high" on <img>', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" priority />;
}`;
        const result = transform(source);

        expect(result.code).toContain('loading="eager"');
        expect(result.code).toContain('decoding="sync"');
        expect(result.code).toContain('fetchpriority="high"');
      });
    });
  });

  describe('Given <Image> with static src inside a conditional expression', () => {
    describe('When the transform runs', () => {
      it('Then optimizes the <Image> inside {condition && <Image .../>}', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page({ show }: { show: boolean }) {
  return <div>{show && <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" />}</div>;
}`;
        const result = transform(source);

        expect(result.code).toContain('<picture>');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given <Image> with static src but non-literal width', () => {
    describe('When the transform runs', () => {
      it('Then leaves the <Image> call unchanged (skips optimization)', () => {
        const source = `
import { Image } from '@vertz/ui';

const SIZE = 80;
function Page() {
  return <Image src="/public/photo.jpg" width={SIZE} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<Image');
        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given <Image> with dynamic class={styles.img}', () => {
    describe('When the transform runs', () => {
      it('Then leaves the <Image> unchanged (avoids silent class loss)', () => {
        const source = `
import { Image } from '@vertz/ui';

const styles = { img: 'rounded' };
function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" class={styles.img} />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<Image');
        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given <Image> with alt containing HTML special characters', () => {
    describe('When the transform runs', () => {
      it('Then escapes the attribute value to prevent XSS', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt={'A "quoted" <value> & more'} />;
}`;
        const result = transform(source);

        expect(result.code).toContain('alt="A &quot;quoted&quot; &lt;value&gt; &amp; more"');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given Image imported from a different package (not @vertz/ui)', () => {
    describe('When the transform runs', () => {
      it('Then returns the code unchanged', () => {
        const source = `
import { Image } from 'some-other-lib';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<Image');
        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given @vertz/ui Image import but no <Image> JSX usage', () => {
    describe('When the transform runs', () => {
      it('Then returns the code unchanged', () => {
        const source = `
import { Image } from '@vertz/ui';

const ImageRef = Image;
function Page() {
  return <div>No Image usage</div>;
}`;
        const result = transform(source);

        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given <Image> with pass-through data-testid attribute', () => {
    describe('When the transform runs', () => {
      it('Then includes the pass-through attribute on the <img>', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" data-testid="hero-img" />;
}`;
        const result = transform(source);

        expect(result.code).toMatch(/<img[^>]*data-testid="hero-img"/);
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given <Image> with explicit loading, decoding, quality, and fit', () => {
    describe('When the transform runs', () => {
      it('Then uses the explicit loading and decoding values', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" loading="eager" decoding="sync" fetchpriority="high" quality={60} fit="contain" />;
}`;
        const result = transform(source);

        expect(result.code).toContain('loading="eager"');
        expect(result.code).toContain('decoding="sync"');
        expect(result.code).toContain('fetchpriority="high"');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given <Image> with priority={true} (explicit boolean)', () => {
    describe('When the transform runs', () => {
      it('Then sets eager loading and high fetchpriority', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" priority={true} />;
}`;
        const result = transform(source);

        expect(result.code).toContain('loading="eager"');
        expect(result.code).toContain('fetchpriority="high"');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given <Image> with priority={false}', () => {
    describe('When the transform runs', () => {
      it('Then uses default lazy loading', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} alt="Photo" priority={false} />;
}`;
        const result = transform(source);

        expect(result.code).toContain('loading="lazy"');
        expect(result.code).toContain('decoding="async"');
        expect(result.code).not.toContain('fetchpriority');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given <Image> with missing alt prop', () => {
    describe('When the transform runs', () => {
      it('Then leaves it unchanged (missing required prop)', () => {
        const source = `
import { Image } from '@vertz/ui';

function Page() {
  return <Image src="/public/photo.jpg" width={80} height={80} />;
}`;
        const result = transform(source);

        expect(result.code).toContain('<Image');
        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given a file with no <Image> import from @vertz/ui', () => {
    describe('When the transform runs', () => {
      it('Then returns the code unchanged (fast path)', () => {
        const source = `
function Page() {
  return <div>Hello</div>;
}`;
        const result = transform(source);

        expect(result.code).toBe(source);
        expect(result.transformed).toBe(false);
      });
    });
  });
});

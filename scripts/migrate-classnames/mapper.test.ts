import { describe, expect, it } from '@vertz/test';
import { mapShorthand } from './mapper';

describe('mapShorthand — spacing', () => {
  it('maps p:4 to padding + token.spacing[4]', () => {
    expect(mapShorthand('p:4')).toEqual({
      entries: [{ cssKey: 'padding', valueExpr: 'token.spacing[4]' }],
      pseudo: null,
    });
  });

  it('maps px:2 to paddingInline + token.spacing[2]', () => {
    expect(mapShorthand('px:2')).toEqual({
      entries: [{ cssKey: 'paddingInline', valueExpr: 'token.spacing[2]' }],
      pseudo: null,
    });
  });

  it('maps mt:0.5 to marginTop with decimal spacing', () => {
    expect(mapShorthand('mt:0.5')).toEqual({
      entries: [{ cssKey: 'marginTop', valueExpr: "token.spacing['0.5']" }],
      pseudo: null,
    });
  });

  it('maps mx:auto to marginInline + string literal', () => {
    expect(mapShorthand('mx:auto')).toEqual({
      entries: [{ cssKey: 'marginInline', valueExpr: "'auto'" }],
      pseudo: null,
    });
  });
});

describe('mapShorthand — colors', () => {
  it('maps bg:primary to backgroundColor + token.color.primary', () => {
    expect(mapShorthand('bg:primary')).toEqual({
      entries: [{ cssKey: 'backgroundColor', valueExpr: 'token.color.primary' }],
      pseudo: null,
    });
  });

  it('maps bg:primary.500 to backgroundColor + shade', () => {
    expect(mapShorthand('bg:primary.500')).toEqual({
      entries: [{ cssKey: 'backgroundColor', valueExpr: 'token.color.primary[500]' }],
      pseudo: null,
    });
  });

  it('maps text:foreground to color token', () => {
    expect(mapShorthand('text:foreground')).toEqual({
      entries: [{ cssKey: 'color', valueExpr: 'token.color.foreground' }],
      pseudo: null,
    });
  });

  it('maps bg:white (CSS color keyword) to literal string', () => {
    expect(mapShorthand('bg:white')).toEqual({
      entries: [{ cssKey: 'backgroundColor', valueExpr: "'white'" }],
      pseudo: null,
    });
  });

  it('maps bg:transparent to literal', () => {
    expect(mapShorthand('bg:transparent')).toEqual({
      entries: [{ cssKey: 'backgroundColor', valueExpr: "'transparent'" }],
      pseudo: null,
    });
  });
});

describe('mapShorthand — keywords', () => {
  it('maps flex keyword to display', () => {
    expect(mapShorthand('flex')).toEqual({
      entries: [{ cssKey: 'display', valueExpr: "'flex'" }],
      pseudo: null,
    });
  });

  it('maps flex-col to flexDirection', () => {
    expect(mapShorthand('flex-col')).toEqual({
      entries: [{ cssKey: 'flexDirection', valueExpr: "'column'" }],
      pseudo: null,
    });
  });

  it('maps truncate (multi-declaration)', () => {
    expect(mapShorthand('truncate')).toEqual({
      entries: [
        { cssKey: 'overflow', valueExpr: "'hidden'" },
        { cssKey: 'whiteSpace', valueExpr: "'nowrap'" },
        { cssKey: 'textOverflow', valueExpr: "'ellipsis'" },
      ],
      pseudo: null,
    });
  });
});

describe('mapShorthand — pseudo prefixes', () => {
  it('maps hover:bg:primary with pseudo selector', () => {
    expect(mapShorthand('hover:bg:primary')).toEqual({
      entries: [{ cssKey: 'backgroundColor', valueExpr: 'token.color.primary' }],
      pseudo: '&:hover',
    });
  });

  it('maps focus:outline-none keyword with pseudo', () => {
    expect(mapShorthand('focus:outline-none')).toEqual({
      entries: [{ cssKey: 'outline', valueExpr: "'none'" }],
      pseudo: '&:focus',
    });
  });

  it('maps disabled:opacity:0.5', () => {
    expect(mapShorthand('disabled:opacity:0.5')).toEqual({
      entries: [{ cssKey: 'opacity', valueExpr: "'0.5'" }],
      pseudo: '&:disabled',
    });
  });
});

describe('mapShorthand — radius / shadow / font', () => {
  it('maps rounded:md to borderRadius + token.radius.md', () => {
    expect(mapShorthand('rounded:md')).toEqual({
      entries: [{ cssKey: 'borderRadius', valueExpr: 'token.radius.md' }],
      pseudo: null,
    });
  });

  it('maps shadow:md to boxShadow + token.shadow.md', () => {
    expect(mapShorthand('shadow:md')).toEqual({
      entries: [{ cssKey: 'boxShadow', valueExpr: 'token.shadow.md' }],
      pseudo: null,
    });
  });

  it('maps font:xl to fontSize + token.font.size.xl', () => {
    expect(mapShorthand('font:xl')).toEqual({
      entries: [{ cssKey: 'fontSize', valueExpr: 'token.font.size.xl' }],
      pseudo: null,
    });
  });

  it('maps font:2xl using bracket notation (key starts with digit)', () => {
    expect(mapShorthand('font:2xl')).toEqual({
      entries: [{ cssKey: 'fontSize', valueExpr: "token.font.size['2xl']" }],
      pseudo: null,
    });
  });

  it('maps text:3xl using bracket notation (key starts with digit)', () => {
    expect(mapShorthand('text:3xl')).toEqual({
      entries: [{ cssKey: 'fontSize', valueExpr: "token.font.size['3xl']" }],
      pseudo: null,
    });
  });

  it('maps rounded:2xl using bracket notation (key starts with digit)', () => {
    expect(mapShorthand('rounded:2xl')).toEqual({
      entries: [{ cssKey: 'borderRadius', valueExpr: "token.radius['2xl']" }],
      pseudo: null,
    });
  });

  it('maps shadow:2xl using bracket notation (key starts with digit)', () => {
    expect(mapShorthand('shadow:2xl')).toEqual({
      entries: [{ cssKey: 'boxShadow', valueExpr: "token.shadow['2xl']" }],
      pseudo: null,
    });
  });

  it('maps font:bold (weight keyword) to fontWeight', () => {
    expect(mapShorthand('font:bold')).toEqual({
      entries: [{ cssKey: 'fontWeight', valueExpr: 'token.font.weight.bold' }],
      pseudo: null,
    });
  });

  it('maps weight:semibold to fontWeight directly', () => {
    expect(mapShorthand('weight:semibold')).toEqual({
      entries: [{ cssKey: 'fontWeight', valueExpr: 'token.font.weight.semibold' }],
      pseudo: null,
    });
  });
});

describe('mapShorthand — alignment + raw', () => {
  it('maps items:center to alignItems', () => {
    expect(mapShorthand('items:center')).toEqual({
      entries: [{ cssKey: 'alignItems', valueExpr: "'center'" }],
      pseudo: null,
    });
  });

  it('maps justify:between to justifyContent: space-between', () => {
    expect(mapShorthand('justify:between')).toEqual({
      entries: [{ cssKey: 'justifyContent', valueExpr: "'space-between'" }],
      pseudo: null,
    });
  });

  it('maps cursor:pointer (raw) to literal', () => {
    expect(mapShorthand('cursor:pointer')).toEqual({
      entries: [{ cssKey: 'cursor', valueExpr: "'pointer'" }],
      pseudo: null,
    });
  });

  it('maps z:10 (raw numeric) to literal string', () => {
    expect(mapShorthand('z:10')).toEqual({
      entries: [{ cssKey: 'zIndex', valueExpr: "'10'" }],
      pseudo: null,
    });
  });
});

describe('mapShorthand — size / border', () => {
  it('maps w:full to width: 100%', () => {
    expect(mapShorthand('w:full')).toEqual({
      entries: [{ cssKey: 'width', valueExpr: "'100%'" }],
      pseudo: null,
    });
  });

  it('maps w:4 to width via spacing', () => {
    expect(mapShorthand('w:4')).toEqual({
      entries: [{ cssKey: 'width', valueExpr: 'token.spacing[4]' }],
      pseudo: null,
    });
  });

  it('maps border:1 to borderWidth', () => {
    expect(mapShorthand('border:1')).toEqual({
      entries: [{ cssKey: 'borderWidth', valueExpr: "'1px'" }],
      pseudo: null,
    });
  });

  it('maps border-r:1 to borderRightWidth with px suffix', () => {
    expect(mapShorthand('border-r:1')).toEqual({
      entries: [{ cssKey: 'borderRightWidth', valueExpr: "'1px'" }],
      pseudo: null,
    });
  });

  it('maps border-t:2 to borderTopWidth with px suffix', () => {
    expect(mapShorthand('border-t:2')).toEqual({
      entries: [{ cssKey: 'borderTopWidth', valueExpr: "'2px'" }],
      pseudo: null,
    });
  });

  it('maps border:primary.500 to borderColor (color mode)', () => {
    expect(mapShorthand('border:primary.500')).toEqual({
      entries: [{ cssKey: 'borderColor', valueExpr: 'token.color.primary[500]' }],
      pseudo: null,
    });
  });

  it('maps text:muted-foreground using bracket notation for hyphenated key', () => {
    expect(mapShorthand('text:muted-foreground')).toEqual({
      entries: [{ cssKey: 'color', valueExpr: "token.color['muted-foreground']" }],
      pseudo: null,
    });
  });

  it('maps bg:primary.50 with numeric shade as bracket number', () => {
    expect(mapShorthand('bg:primary.50')).toEqual({
      entries: [{ cssKey: 'backgroundColor', valueExpr: 'token.color.primary[50]' }],
      pseudo: null,
    });
  });

  it('maps w:screen to 100vw (width axis)', () => {
    expect(mapShorthand('w:screen')).toEqual({
      entries: [{ cssKey: 'width', valueExpr: "'100vw'" }],
      pseudo: null,
    });
  });

  it('maps h:screen to 100vh (height axis)', () => {
    expect(mapShorthand('h:screen')).toEqual({
      entries: [{ cssKey: 'height', valueExpr: "'100vh'" }],
      pseudo: null,
    });
  });

  it('maps min-h:screen to 100vh (height axis)', () => {
    expect(mapShorthand('min-h:screen')).toEqual({
      entries: [{ cssKey: 'minHeight', valueExpr: "'100vh'" }],
      pseudo: null,
    });
  });

  it('maps w:1/2 to 50%', () => {
    expect(mapShorthand('w:1/2')).toEqual({
      entries: [{ cssKey: 'width', valueExpr: "'50%'" }],
      pseudo: null,
    });
  });

  it('maps w:2/3 to 66.666667%', () => {
    expect(mapShorthand('w:2/3')).toEqual({
      entries: [{ cssKey: 'width', valueExpr: "'66.666667%'" }],
      pseudo: null,
    });
  });

  it('throws on fraction with zero denominator', () => {
    expect(() => mapShorthand('w:1/0')).toThrow(/denominator/);
  });
});

describe('mapShorthand — content', () => {
  it('maps content:empty to empty CSS string literal', () => {
    const result = mapShorthand('content:empty');
    expect(result.entries).toEqual([{ cssKey: 'content', valueExpr: `"''"` }]);
  });

  it('maps content:none to CSS keyword', () => {
    const result = mapShorthand('content:none');
    expect(result.entries).toEqual([{ cssKey: 'content', valueExpr: `"none"` }]);
  });

  it('throws on invalid content value', () => {
    expect(() => mapShorthand('content:bogus')).toThrow(/content/i);
  });
});

describe('mapShorthand — color opacity modifier', () => {
  it('maps bg:primary/90 to color-mix literal', () => {
    expect(mapShorthand('bg:primary/90')).toEqual({
      entries: [
        {
          cssKey: 'backgroundColor',
          valueExpr: "'color-mix(in oklch, var(--color-primary) 90%, transparent)'",
        },
      ],
      pseudo: null,
    });
  });

  it('maps hover:bg:primary.700/50 with pseudo', () => {
    expect(mapShorthand('hover:bg:primary.700/50')).toEqual({
      entries: [
        {
          cssKey: 'backgroundColor',
          valueExpr: "'color-mix(in oklch, var(--color-primary-700) 50%, transparent)'",
        },
      ],
      pseudo: '&:hover',
    });
  });

  it('throws on out-of-range opacity', () => {
    expect(() => mapShorthand('bg:primary/150')).toThrow(/opacity/i);
  });
});

describe('mapShorthand — ring', () => {
  it('maps ring:2 to outline with var(--color-ring)', () => {
    expect(mapShorthand('ring:2')).toEqual({
      entries: [{ cssKey: 'outline', valueExpr: "'2px solid var(--color-ring)'" }],
      pseudo: null,
    });
  });

  it('maps ring:ring to outlineColor + token', () => {
    expect(mapShorthand('ring:ring')).toEqual({
      entries: [{ cssKey: 'outlineColor', valueExpr: 'token.color.ring' }],
      pseudo: null,
    });
  });

  it('maps focus:ring:2 with pseudo', () => {
    expect(mapShorthand('focus:ring:2')).toEqual({
      entries: [{ cssKey: 'outline', valueExpr: "'2px solid var(--color-ring)'" }],
      pseudo: '&:focus',
    });
  });
});

describe('mapShorthand — raw aliases', () => {
  it('expands transition:colors to the color-props list with timing', () => {
    const result = mapShorthand('transition:colors');
    expect(result.pseudo).toBeNull();
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.cssKey).toBe('transition');
    expect(result.entries[0]!.valueExpr).toMatch(/^'color 150ms cubic-bezier/);
    expect(result.entries[0]!.valueExpr).toContain('background-color');
    expect(result.entries[0]!.valueExpr).toContain('stroke');
  });

  it('expands transition:all to all + timing', () => {
    expect(mapShorthand('transition:all')).toEqual({
      entries: [{ cssKey: 'transition', valueExpr: "'all 150ms cubic-bezier(0.4, 0, 0.2, 1)'" }],
      pseudo: null,
    });
  });

  it('expands transition:shadow to box-shadow + timing', () => {
    expect(mapShorthand('transition:shadow')).toEqual({
      entries: [
        { cssKey: 'transition', valueExpr: "'box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1)'" },
      ],
      pseudo: null,
    });
  });

  it('expands tracking:tight to letterSpacing + -0.025em', () => {
    expect(mapShorthand('tracking:tight')).toEqual({
      entries: [{ cssKey: 'letterSpacing', valueExpr: "'-0.025em'" }],
      pseudo: null,
    });
  });

  it('expands tracking:wider to letterSpacing + 0.05em', () => {
    expect(mapShorthand('tracking:wider')).toEqual({
      entries: [{ cssKey: 'letterSpacing', valueExpr: "'0.05em'" }],
      pseudo: null,
    });
  });

  it('expands grid-cols:3 to gridTemplateColumns + repeat()', () => {
    expect(mapShorthand('grid-cols:3')).toEqual({
      entries: [{ cssKey: 'gridTemplateColumns', valueExpr: "'repeat(3, minmax(0, 1fr))'" }],
      pseudo: null,
    });
  });

  it('expands aspect:square to aspectRatio + 1 / 1', () => {
    expect(mapShorthand('aspect:square')).toEqual({
      entries: [{ cssKey: 'aspectRatio', valueExpr: "'1 / 1'" }],
      pseudo: null,
    });
  });

  it('expands aspect:video to aspectRatio + 16 / 9', () => {
    expect(mapShorthand('aspect:video')).toEqual({
      entries: [{ cssKey: 'aspectRatio', valueExpr: "'16 / 9'" }],
      pseudo: null,
    });
  });

  it('resolves top:4 via spacing scale', () => {
    expect(mapShorthand('top:4')).toEqual({
      entries: [{ cssKey: 'top', valueExpr: 'token.spacing[4]' }],
      pseudo: null,
    });
  });

  it('resolves inset:8 via spacing scale', () => {
    expect(mapShorthand('inset:8')).toEqual({
      entries: [{ cssKey: 'inset', valueExpr: 'token.spacing[8]' }],
      pseudo: null,
    });
  });

  it('falls back to quoted raw value for top:0 (valid CSS zero)', () => {
    expect(mapShorthand('top:0')).toEqual({
      entries: [{ cssKey: 'top', valueExpr: 'token.spacing[0]' }],
      pseudo: null,
    });
  });
});

describe('mapShorthand — errors', () => {
  it('throws on unknown shorthand', () => {
    expect(() => mapShorthand('bogus:whatever')).toThrow(/unknown/i);
  });

  it('throws on empty input', () => {
    expect(() => mapShorthand('')).toThrow();
  });
});

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

  it('maps border:primary.500 to borderColor (color mode)', () => {
    expect(mapShorthand('border:primary.500')).toEqual({
      entries: [{ cssKey: 'borderColor', valueExpr: 'token.color.primary[500]' }],
      pseudo: null,
    });
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

describe('mapShorthand — errors', () => {
  it('throws on unknown shorthand', () => {
    expect(() => mapShorthand('bogus:whatever')).toThrow(/unknown/i);
  });

  it('throws on empty input', () => {
    expect(() => mapShorthand('')).toThrow();
  });
});

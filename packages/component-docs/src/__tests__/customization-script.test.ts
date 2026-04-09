import { describe, expect, it } from '@vertz/test';
import { palettes } from '@vertz/theme-shadcn';
import { generateCustomizationScript } from '../customization-script';
import { ACCENT_PRESETS, RADIUS_VALUES } from '../hooks/use-customization';

describe('Feature: Customization blocking script', () => {
  describe('Given generateCustomizationScript()', () => {
    const script = generateCustomizationScript();

    it('Then returns a <script> tag', () => {
      expect(script).toStartWith('<script>');
      expect(script).toEndWith('</script>');
    });

    it('Then contains valid JavaScript that parses without errors', () => {
      // Extract the JS between <script> and </script>
      const js = script.slice('<script>'.length, -'</script>'.length);
      // This throws SyntaxError if the script has invalid JS (e.g., bad JSON)
      expect(() => new Function(js)).not.toThrow();
    });

    it('Then reads the vertz-customization cookie', () => {
      expect(script).toContain('vertz-customization');
    });

    it('Then embeds non-default palette token values', () => {
      const slateTokens = palettes.slate;
      expect(script).toContain(slateTokens.background.DEFAULT);
      expect(script).toContain(slateTokens.background._dark);
      expect(script).toContain(palettes.stone.background.DEFAULT);
    });

    it('Then does not embed the default palette (zinc)', () => {
      expect(script).toContain("palette!=='zinc'");
    });

    it('Then embeds accent preset token values', () => {
      const bluePreset = ACCENT_PRESETS.blue;
      expect(script).toContain(bluePreset.tokens.primary.DEFAULT);
      expect(script).toContain(bluePreset.tokens.primary._dark);
      const rosePreset = ACCENT_PRESETS.rose;
      expect(script).toContain(rosePreset.tokens.primary.DEFAULT);
    });

    it('Then embeds radius values', () => {
      for (const value of Object.values(RADIUS_VALUES)) {
        expect(script).toContain(value);
      }
    });

    it('Then reads data-theme attribute for mode detection', () => {
      expect(script).toContain('data-theme');
    });

    it('Then sets CSS custom properties on document.documentElement', () => {
      expect(script).toContain('root.style.setProperty');
      expect(script).toContain('--color-');
      expect(script).toContain('--radius');
    });

    it('Then escapes </ sequences to prevent script tag injection', () => {
      // The raw JSON should not contain </ which could close the <script> tag
      const js = script.slice('<script>'.length, -'</script>'.length);
      // Check that no unescaped </ exists (other than in the wrapping tags)
      expect(js).not.toContain('</');
    });
  });

  describe('Given the inline script behavior', () => {
    it('Then exits early when no cookie is set (no-op)', () => {
      const script = generateCustomizationScript();
      // The script checks for cookie match and returns early if missing
      expect(script).toContain('if(!m)return');
    });

    it('Then exits early when cookie has too few parts', () => {
      const script = generateCustomizationScript();
      expect(script).toContain('if(parts.length<3)return');
    });

    it('Then skips palette override for default zinc palette', () => {
      const script = generateCustomizationScript();
      expect(script).toContain("palette!=='zinc'");
    });

    it('Then skips radius override for default md radius', () => {
      const script = generateCustomizationScript();
      expect(script).toContain("radius!=='md'");
    });

    it('Then skips accent override for default accent', () => {
      const script = generateCustomizationScript();
      expect(script).toContain("accent!=='default'");
    });

    it('Then validates palette/accent/radius against embedded data before applying', () => {
      const script = generateCustomizationScript();
      // Existence checks: D.p[palette], D.r[radius], D.a[accent]
      expect(script).toContain('D.p[palette]');
      expect(script).toContain('D.r[radius]');
      expect(script).toContain('D.a[accent]');
    });
  });
});

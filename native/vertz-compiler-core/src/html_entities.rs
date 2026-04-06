//! HTML entity decoding for JSX text nodes.
//!
//! OXC does not decode HTML entities in `JSXText` nodes (see oxc#9667).
//! JSX compilers (Babel, TypeScript) decode entities at compile time so that
//! `document.createTextNode()` receives the actual Unicode character, not the
//! raw entity string. This module provides that missing step.
//!
//! Supports:
//!
//! - Numeric decimal references: `&#8592;` → `←`
//! - Numeric hex references: `&#x2190;` → `←`
//! - Named HTML entities: `&larr;` → `←`, `&amp;` → `&`, etc.

/// Decode all HTML entities in the given input string.
///
/// Returns a new string with entities replaced by their Unicode characters.
/// Unknown named entities are left as-is.
pub fn decode_html_entities(input: &str) -> String {
    if !input.contains('&') {
        return input.to_string();
    }

    let mut result = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if bytes[i] == b'&' {
            // Look for the closing semicolon
            if let Some(semi_offset) = bytes[i + 1..].iter().position(|&b| b == b';') {
                let semi = i + 1 + semi_offset;
                let entity = &input[i + 1..semi]; // between & and ;

                if let Some(decoded) = decode_entity(entity) {
                    result.push(decoded);
                    i = semi + 1;
                    continue;
                }
            }
            // Not a valid entity — emit the `&` literally
            result.push('&');
            i += 1;
        } else {
            result.push(input[i..].chars().next().unwrap());
            i += input[i..].chars().next().unwrap().len_utf8();
        }
    }

    result
}

/// Decode a single entity reference (the part between `&` and `;`).
fn decode_entity(entity: &str) -> Option<char> {
    if entity.is_empty() {
        return None;
    }

    // Numeric reference: &#123; or &#x1F;
    if let Some(rest) = entity.strip_prefix('#') {
        return decode_numeric(rest);
    }

    // Named entity lookup
    lookup_named_entity(entity)
}

/// Decode a numeric character reference (decimal or hex).
fn decode_numeric(s: &str) -> Option<char> {
    let codepoint = if let Some(hex) = s.strip_prefix('x').or_else(|| s.strip_prefix('X')) {
        u32::from_str_radix(hex, 16).ok()?
    } else {
        s.parse::<u32>().ok()?
    };

    char::from_u32(codepoint)
}

/// Lookup a named HTML entity.
///
/// Covers the XML entities plus the most commonly used HTML5 named entities.
/// Unknown names return `None` (left as-is in the output).
fn lookup_named_entity(name: &str) -> Option<char> {
    // Using a match for compile-time optimization. Covers all entities
    // commonly seen in web development.
    match name {
        // XML entities (required by JSX spec)
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),

        // Common symbols
        "nbsp" => Some('\u{00A0}'),
        "copy" => Some('©'),
        "reg" => Some('®'),
        "trade" => Some('™'),
        "deg" => Some('°'),
        "plusmn" => Some('±'),
        "times" => Some('×'),
        "divide" => Some('÷'),
        "micro" => Some('µ'),
        "para" => Some('¶'),
        "middot" => Some('·'),
        "bull" => Some('•'),
        "hellip" => Some('…'),
        "prime" => Some('′'),
        "Prime" => Some('″'),
        "permil" => Some('‰'),

        // Currency
        "cent" => Some('¢'),
        "pound" => Some('£'),
        "yen" => Some('¥'),
        "euro" => Some('€'),
        "curren" => Some('¤'),

        // Arrows
        "larr" => Some('←'),
        "uarr" => Some('↑'),
        "rarr" => Some('→'),
        "darr" => Some('↓'),
        "harr" => Some('↔'),
        "lArr" => Some('⇐'),
        "uArr" => Some('⇑'),
        "rArr" => Some('⇒'),
        "dArr" => Some('⇓'),
        "hArr" => Some('⇔'),

        // Dashes and spaces
        "ndash" => Some('–'),
        "mdash" => Some('—'),
        "lsquo" => Some('\u{2018}'),
        "rsquo" => Some('\u{2019}'),
        "sbquo" => Some('\u{201A}'),
        "ldquo" => Some('\u{201C}'),
        "rdquo" => Some('\u{201D}'),
        "bdquo" => Some('\u{201E}'),
        "laquo" => Some('«'),
        "raquo" => Some('»'),
        "lsaquo" => Some('‹'),
        "rsaquo" => Some('›'),
        "ensp" => Some('\u{2002}'),
        "emsp" => Some('\u{2003}'),
        "thinsp" => Some('\u{2009}'),
        "zwnj" => Some('\u{200C}'),
        "zwj" => Some('\u{200D}'),

        // Math operators
        "minus" => Some('−'),
        "lowast" => Some('∗'),
        "radic" => Some('√'),
        "infin" => Some('∞'),
        "asymp" => Some('≈'),
        "ne" => Some('≠'),
        "le" => Some('≤'),
        "ge" => Some('≥'),
        "sum" => Some('∑'),
        "prod" => Some('∏'),
        "int" => Some('∫'),
        "part" => Some('∂'),
        "nabla" => Some('∇'),
        "isin" => Some('∈'),
        "notin" => Some('∉'),
        "sub" => Some('⊂'),
        "sup" => Some('⊃'),
        "sube" => Some('⊆'),
        "supe" => Some('⊇'),
        "oplus" => Some('⊕'),
        "otimes" => Some('⊗'),
        "perp" => Some('⊥'),
        "and" => Some('∧'),
        "or" => Some('∨'),
        "cap" => Some('∩'),
        "cup" => Some('∪'),
        "there4" => Some('∴'),
        "sim" => Some('∼'),
        "prop" => Some('∝'),
        "exist" => Some('∃'),
        "forall" => Some('∀'),
        "empty" => Some('∅'),
        "not" => Some('¬'),
        "ang" => Some('∠'),

        // Greek letters (lowercase)
        "alpha" => Some('α'),
        "beta" => Some('β'),
        "gamma" => Some('γ'),
        "delta" => Some('δ'),
        "epsilon" => Some('ε'),
        "zeta" => Some('ζ'),
        "eta" => Some('η'),
        "theta" => Some('θ'),
        "iota" => Some('ι'),
        "kappa" => Some('κ'),
        "lambda" => Some('λ'),
        "mu" => Some('μ'),
        "nu" => Some('ν'),
        "xi" => Some('ξ'),
        "omicron" => Some('ο'),
        "pi" => Some('π'),
        "rho" => Some('ρ'),
        "sigma" => Some('σ'),
        "tau" => Some('τ'),
        "upsilon" => Some('υ'),
        "phi" => Some('φ'),
        "chi" => Some('χ'),
        "psi" => Some('ψ'),
        "omega" => Some('ω'),

        // Greek letters (uppercase)
        "Alpha" => Some('Α'),
        "Beta" => Some('Β'),
        "Gamma" => Some('Γ'),
        "Delta" => Some('Δ'),
        "Epsilon" => Some('Ε'),
        "Zeta" => Some('Ζ'),
        "Eta" => Some('Η'),
        "Theta" => Some('Θ'),
        "Iota" => Some('Ι'),
        "Kappa" => Some('Κ'),
        "Lambda" => Some('Λ'),
        "Mu" => Some('Μ'),
        "Nu" => Some('Ν'),
        "Xi" => Some('Ξ'),
        "Omicron" => Some('Ο'),
        "Pi" => Some('Π'),
        "Rho" => Some('Ρ'),
        "Sigma" => Some('Σ'),
        "Tau" => Some('Τ'),
        "Upsilon" => Some('Υ'),
        "Phi" => Some('Φ'),
        "Chi" => Some('Χ'),
        "Psi" => Some('Ψ'),
        "Omega" => Some('Ω'),

        // Misc symbols
        "spades" => Some('♠'),
        "clubs" => Some('♣'),
        "hearts" => Some('♥'),
        "diams" => Some('♦'),
        "loz" => Some('◊'),
        "dagger" => Some('†'),
        "Dagger" => Some('‡'),
        "sect" => Some('§'),
        "iexcl" => Some('¡'),
        "iquest" => Some('¿'),
        "ordf" => Some('ª'),
        "ordm" => Some('º'),
        "frac14" => Some('¼'),
        "frac12" => Some('½'),
        "frac34" => Some('¾'),
        "sup1" => Some('¹'),
        "sup2" => Some('²'),
        "sup3" => Some('³'),
        "macr" => Some('¯'),
        "cedil" => Some('¸'),

        // Accented characters (Latin)
        "Agrave" => Some('À'),
        "Aacute" => Some('Á'),
        "Acirc" => Some('Â'),
        "Atilde" => Some('Ã'),
        "Auml" => Some('Ä'),
        "Aring" => Some('Å'),
        "AElig" => Some('Æ'),
        "Ccedil" => Some('Ç'),
        "Egrave" => Some('È'),
        "Eacute" => Some('É'),
        "Ecirc" => Some('Ê'),
        "Euml" => Some('Ë'),
        "Igrave" => Some('Ì'),
        "Iacute" => Some('Í'),
        "Icirc" => Some('Î'),
        "Iuml" => Some('Ï'),
        "ETH" => Some('Ð'),
        "Ntilde" => Some('Ñ'),
        "Ograve" => Some('Ò'),
        "Oacute" => Some('Ó'),
        "Ocirc" => Some('Ô'),
        "Otilde" => Some('Õ'),
        "Ouml" => Some('Ö'),
        "Oslash" => Some('Ø'),
        "Ugrave" => Some('Ù'),
        "Uacute" => Some('Ú'),
        "Ucirc" => Some('Û'),
        "Uuml" => Some('Ü'),
        "Yacute" => Some('Ý'),
        "THORN" => Some('Þ'),
        "szlig" => Some('ß'),
        "agrave" => Some('à'),
        "aacute" => Some('á'),
        "acirc" => Some('â'),
        "atilde" => Some('ã'),
        "auml" => Some('ä'),
        "aring" => Some('å'),
        "aelig" => Some('æ'),
        "ccedil" => Some('ç'),
        "egrave" => Some('è'),
        "eacute" => Some('é'),
        "ecirc" => Some('ê'),
        "euml" => Some('ë'),
        "igrave" => Some('ì'),
        "iacute" => Some('í'),
        "icirc" => Some('î'),
        "iuml" => Some('ï'),
        "eth" => Some('ð'),
        "ntilde" => Some('ñ'),
        "ograve" => Some('ò'),
        "oacute" => Some('ó'),
        "ocirc" => Some('ô'),
        "otilde" => Some('õ'),
        "ouml" => Some('ö'),
        "oslash" => Some('ø'),
        "ugrave" => Some('ù'),
        "uacute" => Some('ú'),
        "ucirc" => Some('û'),
        "uuml" => Some('ü'),
        "yacute" => Some('ý'),
        "thorn" => Some('þ'),
        "yuml" => Some('ÿ'),

        // Special typography
        "OElig" => Some('Œ'),
        "oelig" => Some('œ'),
        "Scaron" => Some('Š'),
        "scaron" => Some('š'),
        "Yuml" => Some('Ÿ'),
        "fnof" => Some('ƒ'),
        "circ" => Some('ˆ'),
        "tilde" => Some('˜'),

        // Emoji / pictographs via numeric ref is already handled;
        // named references for common ones
        "check" => Some('✓'),
        "cross" => Some('✗'),

        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_entities() {
        assert_eq!(decode_html_entities("&amp;"), "&");
        assert_eq!(decode_html_entities("&lt;"), "<");
        assert_eq!(decode_html_entities("&gt;"), ">");
        assert_eq!(decode_html_entities("&quot;"), "\"");
        assert_eq!(decode_html_entities("&apos;"), "'");
    }

    #[test]
    fn named_entities() {
        assert_eq!(decode_html_entities("&larr;"), "←");
        assert_eq!(decode_html_entities("&rarr;"), "→");
        assert_eq!(decode_html_entities("&mdash;"), "—");
        assert_eq!(decode_html_entities("&nbsp;"), "\u{00A0}");
        assert_eq!(decode_html_entities("&copy;"), "©");
        assert_eq!(decode_html_entities("&euro;"), "€");
    }

    #[test]
    fn numeric_decimal_reference() {
        assert_eq!(decode_html_entities("&#8592;"), "←");
        assert_eq!(decode_html_entities("&#169;"), "©");
        assert_eq!(decode_html_entities("&#38;"), "&");
    }

    #[test]
    fn numeric_hex_reference() {
        assert_eq!(decode_html_entities("&#x2190;"), "←");
        assert_eq!(decode_html_entities("&#xA9;"), "©");
        assert_eq!(decode_html_entities("&#x26;"), "&");
        // Uppercase X
        assert_eq!(decode_html_entities("&#X2190;"), "←");
    }

    #[test]
    fn mixed_text_and_entities() {
        assert_eq!(
            decode_html_entities("&larr; Back to Games"),
            "← Back to Games"
        );
        assert_eq!(
            decode_html_entities("Hello &amp; welcome &mdash; enjoy!"),
            "Hello & welcome — enjoy!"
        );
    }

    #[test]
    fn no_entities() {
        assert_eq!(decode_html_entities("Hello world"), "Hello world");
        assert_eq!(decode_html_entities(""), "");
    }

    #[test]
    fn unknown_entity_preserved() {
        assert_eq!(decode_html_entities("&unknownxyz;"), "&unknownxyz;");
    }

    #[test]
    fn ampersand_without_semicolon() {
        assert_eq!(decode_html_entities("a & b"), "a & b");
        assert_eq!(decode_html_entities("&"), "&");
    }

    #[test]
    fn multiple_entities() {
        assert_eq!(decode_html_entities("&lt;div&gt;"), "<div>");
    }

    #[test]
    fn emoji_numeric_reference() {
        assert_eq!(decode_html_entities("&#128722;"), "🛒");
    }

    #[test]
    fn entity_at_end_of_string() {
        assert_eq!(decode_html_entities("arrow &larr;"), "arrow ←");
    }

    #[test]
    fn consecutive_entities() {
        assert_eq!(decode_html_entities("&larr;&rarr;"), "←→");
    }
}

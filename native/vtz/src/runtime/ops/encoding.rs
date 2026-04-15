use deno_core::op2;
use deno_core::OpDecl;

/// Encode a string to UTF-8 bytes.
#[op2]
#[serde]
pub fn op_text_encode(#[string] input: String) -> Vec<u8> {
    input.into_bytes()
}

/// Decode UTF-8 bytes to a string.
/// When fatal is true, invalid UTF-8 returns an error.
/// When fatal is false, invalid bytes are replaced with U+FFFD.
/// When ignore_bom is false (default), leading BOM is stripped.
#[op2]
#[string]
pub fn op_text_decode(
    #[buffer] input: &[u8],
    #[string] encoding: String,
    fatal: bool,
    ignore_bom: bool,
) -> Result<String, deno_core::error::AnyError> {
    let enc = encoding.to_ascii_lowercase();
    let is_latin1 = enc == "latin1"
        || enc == "iso-8859-1"
        || enc == "iso8859-1"
        || enc == "iso88591"
        || enc == "windows-1252"
        || enc == "ascii"
        || enc == "us-ascii";
    let is_utf8 = enc == "utf-8" || enc == "utf8" || enc == "unicode-1-1-utf-8";

    if !is_utf8 && !is_latin1 {
        return Err(deno_core::anyhow::anyhow!(
            "RangeError: The encoding label provided ('{}') is not supported.",
            encoding
        ));
    }

    let result = if is_latin1 {
        // WHATWG Encoding Standard: iso-8859-1 is an alias for windows-1252.
        // Bytes 0x80-0x9F differ from naive Latin-1 (byte → code point) mapping.
        input
            .iter()
            .map(|&b| windows_1252_decode(b))
            .collect::<String>()
    } else if fatal {
        String::from_utf8(input.to_vec())
            .map_err(|e| deno_core::anyhow::anyhow!("TypeError: {}", e))?
    } else {
        String::from_utf8_lossy(input).into_owned()
    };

    // Strip leading BOM when ignoreBOM is false
    if !ignore_bom && result.starts_with('\u{FEFF}') {
        Ok(result.strip_prefix('\u{FEFF}').unwrap().to_string())
    } else {
        Ok(result)
    }
}

/// Base64 encode a string (btoa).
#[op2]
#[string]
pub fn op_btoa(#[string] input: String) -> Result<String, deno_core::error::AnyError> {
    // btoa works on Latin-1 (each char must be 0-255)
    let mut bytes = Vec::with_capacity(input.len());
    for ch in input.chars() {
        if ch as u32 > 255 {
            return Err(deno_core::anyhow::anyhow!(
                "InvalidCharacterError: The string to be encoded contains characters outside of the Latin1 range."
            ));
        }
        bytes.push(ch as u8);
    }
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Base64 decode a string (atob).
/// Browsers' atob is lenient with padding — we must match that behavior.
#[op2]
#[string]
pub fn op_atob(#[string] input: String) -> Result<String, deno_core::error::AnyError> {
    use base64::Engine;
    // Strip whitespace (browsers ignore it)
    let cleaned: String = input.chars().filter(|c| !c.is_ascii_whitespace()).collect();
    // Add padding if missing (browsers are lenient)
    let padded = match cleaned.len() % 4 {
        2 => format!("{}==", cleaned),
        3 => format!("{}=", cleaned),
        _ => cleaned,
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&padded)
        .map_err(|e| {
            deno_core::anyhow::anyhow!(
                "InvalidCharacterError: The string to be decoded is not correctly encoded. {}",
                e
            )
        })?;
    // atob returns a Latin-1 string (each byte as a char)
    Ok(bytes.iter().map(|&b| b as char).collect())
}

/// Decode a single byte using the WHATWG windows-1252 mapping.
///
/// Bytes outside 0x80-0x9F map directly to their Unicode code point.
/// Bytes 0x80-0x9F use the windows-1252 table per the WHATWG Encoding Standard.
fn windows_1252_decode(b: u8) -> char {
    // WHATWG windows-1252 index for bytes 0x80-0x9F
    const TABLE: [char; 32] = [
        '\u{20AC}', '\u{0081}', '\u{201A}', '\u{0192}', '\u{201E}', '\u{2026}', '\u{2020}',
        '\u{2021}', '\u{02C6}', '\u{2030}', '\u{0160}', '\u{2039}', '\u{0152}', '\u{008D}',
        '\u{017D}', '\u{008F}', '\u{0090}', '\u{2018}', '\u{2019}', '\u{201C}', '\u{201D}',
        '\u{2022}', '\u{2013}', '\u{2014}', '\u{02DC}', '\u{2122}', '\u{0161}', '\u{203A}',
        '\u{0153}', '\u{009D}', '\u{017E}', '\u{0178}',
    ];
    if (0x80..=0x9F).contains(&b) {
        TABLE[(b - 0x80) as usize]
    } else {
        b as char
    }
}

/// Get the op declarations for encoding ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_text_encode(), op_text_decode(), op_btoa(), op_atob()]
}

/// JavaScript bootstrap code for TextEncoder, TextDecoder, atob, btoa.
pub const ENCODING_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  class TextEncoder {
    get encoding() { return 'utf-8'; }
    encode(input = '') {
      return new Uint8Array(Deno.core.ops.op_text_encode(String(input)));
    }
    encodeInto(source, destination) {
      const str = String(source);
      const bytes = Deno.core.ops.op_text_encode(str);
      const len = Math.min(bytes.length, destination.byteLength);
      for (let i = 0; i < len; i++) {
        destination[i] = bytes[i];
      }
      // Count how many complete UTF-8 characters fit
      let read = 0;
      let written = 0;
      for (let i = 0; i < str.length; i++) {
        const code = str.codePointAt(i);
        let byteLen;
        if (code <= 0x7F) byteLen = 1;
        else if (code <= 0x7FF) byteLen = 2;
        else if (code <= 0xFFFF) byteLen = 3;
        else { byteLen = 4; i++; } // surrogate pair
        if (written + byteLen > destination.byteLength) break;
        written += byteLen;
        read++;
        if (byteLen === 4) read++; // surrogate pair counts as 2 in string
      }
      return { read, written };
    }
  }

  class TextDecoder {
    #encoding;
    #fatal;
    #ignoreBOM;

    constructor(encoding = 'utf-8', options = {}) {
      const label = String(encoding).toLowerCase().trim();
      const isUtf8 = label === 'utf-8' || label === 'utf8' || label === 'unicode-1-1-utf-8';
      const isLatin1 = label === 'latin1' || label === 'iso-8859-1' || label === 'iso8859-1'
        || label === 'iso88591' || label === 'windows-1252' || label === 'ascii' || label === 'us-ascii';
      if (!isUtf8 && !isLatin1) {
        throw new RangeError(`The encoding label provided ('${encoding}') is not supported.`);
      }
      this.#encoding = isLatin1 ? label : 'utf-8';
      this.#fatal = !!options.fatal;
      this.#ignoreBOM = !!options.ignoreBOM;
    }

    get encoding() { return this.#encoding; }
    get fatal() { return this.#fatal; }
    get ignoreBOM() { return this.#ignoreBOM; }

    decode(input, options = {}) {
      if (input === undefined) return '';
      let bytes;
      if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
      } else if (ArrayBuffer.isView(input)) {
        bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      } else {
        throw new TypeError('The provided value is not of type \'(ArrayBuffer or ArrayBufferView)\'');
      }
      try {
        return Deno.core.ops.op_text_decode(bytes, this.#encoding, this.#fatal, this.#ignoreBOM);
      } catch (e) {
        if (this.#fatal && e.message && e.message.includes('TypeError:')) {
          throw new TypeError(e.message.replace('TypeError: ', ''));
        }
        throw e;
      }
    }
  }

  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;

  globalThis.btoa = (input) => Deno.core.ops.op_btoa(String(input));
  globalThis.atob = (input) => Deno.core.ops.op_atob(String(input));
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    // --- TextEncoder tests ---

    #[test]
    fn test_text_encoder_encode_returns_uint8array() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const encoder = new TextEncoder();
                const bytes = encoder.encode('hello');
                [bytes instanceof Uint8Array, bytes.length, Array.from(bytes)]
            "#,
            )
            .unwrap();
        let arr = result.as_array().unwrap();
        assert!(arr[0].as_bool().unwrap(), "should be Uint8Array");
        assert_eq!(arr[1].as_u64().unwrap(), 5);
        assert_eq!(
            arr[2],
            serde_json::json!([104, 101, 108, 108, 111]) // 'hello' in UTF-8
        );
    }

    #[test]
    fn test_text_encoder_encoding_property() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "new TextEncoder().encoding")
            .unwrap();
        assert_eq!(result, serde_json::json!("utf-8"));
    }

    #[test]
    fn test_text_encoder_multibyte() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const encoder = new TextEncoder();
                const bytes = encoder.encode('café');
                bytes.length
            "#,
            )
            .unwrap();
        // 'café' = c(1) + a(1) + f(1) + é(2) = 5 bytes in UTF-8
        assert_eq!(result, serde_json::json!(5));
    }

    #[test]
    fn test_text_encoder_empty_string() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const encoder = new TextEncoder();
                encoder.encode('').length
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(0));
    }

    // --- TextDecoder tests ---

    #[test]
    fn test_text_decoder_decode_uint8array() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const decoder = new TextDecoder();
                decoder.decode(new Uint8Array([104, 101, 108, 108, 111]))
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hello"));
    }

    #[test]
    fn test_text_decoder_decode_arraybuffer() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const decoder = new TextDecoder();
                const buf = new Uint8Array([104, 105]).buffer;
                decoder.decode(buf)
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hi"));
    }

    #[test]
    fn test_text_decoder_encoding_property() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "new TextDecoder().encoding")
            .unwrap();
        assert_eq!(result, serde_json::json!("utf-8"));
    }

    #[test]
    fn test_text_decoder_unsupported_encoding_throws_range_error() {
        let mut rt = create_runtime();
        let result = rt.execute_script(
            "<test>",
            r#"
            try {
                new TextDecoder('shift-jis');
                'no error';
            } catch (e) {
                e instanceof RangeError ? 'RangeError' : e.constructor.name;
            }
        "#,
        );
        assert_eq!(result.unwrap(), serde_json::json!("RangeError"));
    }

    #[test]
    fn test_text_decoder_latin1_encoding_supported() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const decoder = new TextDecoder('iso-8859-1');
                decoder.decode(new Uint8Array([0xE9, 0xE8, 0xEA]))
            "#,
            )
            .unwrap();
        // 0xE9=é, 0xE8=è, 0xEA=ê in Latin-1
        assert_eq!(result, serde_json::json!("éèê"));
    }

    #[test]
    fn test_text_decoder_windows_1252_special_bytes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const decoder = new TextDecoder('windows-1252');
                // 0x80 = € (U+20AC), 0x85 = … (U+2026), 0x91 = ' (U+2018)
                const decoded = decoder.decode(new Uint8Array([0x80, 0x85, 0x91]));
                [decoded.codePointAt(0), decoded.codePointAt(1), decoded.codePointAt(2)]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([0x20AC, 0x2026, 0x2018]));
    }

    #[test]
    fn test_text_encoder_decoder_roundtrip() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const original = 'hello world 🌍';
                const encoded = new TextEncoder().encode(original);
                const decoded = new TextDecoder().decode(encoded);
                decoded === original
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_text_decoder_decode_undefined_returns_empty() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "new TextDecoder().decode(undefined)")
            .unwrap();
        assert_eq!(result, serde_json::json!(""));
    }

    #[test]
    fn test_text_decoder_utf8_alias() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const decoder = new TextDecoder('utf8');
                decoder.decode(new Uint8Array([104, 105]))
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hi"));
    }

    // --- BLOCKER-2: TextDecoder fatal mode ---

    #[test]
    fn test_text_decoder_non_fatal_replaces_invalid_bytes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const decoder = new TextDecoder(); // fatal: false (default)
                const bytes = new Uint8Array([104, 105, 0xFF, 0xFE]);
                const decoded = decoder.decode(bytes);
                // Invalid bytes should be replaced with U+FFFD
                decoded.startsWith('hi') && decoded.includes('\uFFFD')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_text_decoder_fatal_throws_on_invalid_bytes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
            try {
                const decoder = new TextDecoder('utf-8', { fatal: true });
                decoder.decode(new Uint8Array([104, 105, 0xFF, 0xFE]));
                'no error';
            } catch (e) {
                e instanceof TypeError ? 'TypeError' : e.constructor.name;
            }
        "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("TypeError"));
    }

    // --- BLOCKER-3: BOM stripping ---

    #[test]
    fn test_text_decoder_strips_bom_by_default() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const decoder = new TextDecoder(); // ignoreBOM: false (default)
                const bom = new Uint8Array([0xEF, 0xBB, 0xBF, 0x68, 0x69]);
                decoder.decode(bom)
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hi"));
    }

    #[test]
    fn test_text_decoder_preserves_bom_when_ignore_bom_true() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
                const bom = new Uint8Array([0xEF, 0xBB, 0xBF, 0x68, 0x69]);
                const decoded = decoder.decode(bom);
                decoded === '\uFEFFhi'
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    // --- btoa / atob tests ---

    #[test]
    fn test_btoa_basic() {
        let mut rt = create_runtime();
        let result = rt.execute_script("<test>", "btoa('hello')").unwrap();
        assert_eq!(result, serde_json::json!("aGVsbG8="));
    }

    #[test]
    fn test_atob_basic() {
        let mut rt = create_runtime();
        let result = rt.execute_script("<test>", "atob('aGVsbG8=')").unwrap();
        assert_eq!(result, serde_json::json!("hello"));
    }

    #[test]
    fn test_btoa_atob_roundtrip() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const original = 'Hello, World! 123';
                atob(btoa(original)) === original
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_btoa_empty_string() {
        let mut rt = create_runtime();
        let result = rt.execute_script("<test>", "btoa('')").unwrap();
        assert_eq!(result, serde_json::json!(""));
    }

    #[test]
    fn test_atob_empty_string() {
        let mut rt = create_runtime();
        let result = rt.execute_script("<test>", "atob('')").unwrap();
        assert_eq!(result, serde_json::json!(""));
    }

    #[test]
    fn test_btoa_binary_data() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", r#"btoa(String.fromCharCode(0, 1, 255))"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("AAH/"));
    }

    // --- NIT-2: btoa rejection of non-Latin1 ---

    #[test]
    fn test_btoa_rejects_non_latin1() {
        let mut rt = create_runtime();
        let result = rt.execute_script(
            "<test>",
            r#"
            try {
                btoa('\u0100');
                'no error';
            } catch (e) {
                e.message.includes('InvalidCharacterError') ? 'rejected' : e.message;
            }
        "#,
        );
        assert_eq!(result.unwrap(), serde_json::json!("rejected"));
    }

    // --- NIT-3: atob rejection of invalid base64 ---

    #[test]
    fn test_atob_rejects_invalid_base64() {
        let mut rt = create_runtime();
        let result = rt.execute_script(
            "<test>",
            r#"
            try {
                atob('not-valid-base64!!!');
                'no error';
            } catch (e) {
                e.message.includes('InvalidCharacterError') ? 'rejected' : e.message;
            }
        "#,
        );
        assert_eq!(result.unwrap(), serde_json::json!("rejected"));
    }
}

use deno_core::op2;
use deno_core::OpDecl;

#[op2]
#[string]
pub fn op_crypto_random_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[op2]
#[serde]
pub fn op_crypto_get_random_values(
    #[smi] byte_length: u32,
) -> Result<Vec<u8>, deno_core::error::AnyError> {
    if byte_length > 65536 {
        return Err(deno_core::anyhow::anyhow!(
            "QuotaExceededError: The ArrayBuffer/ArrayBufferView size exceeds the maximum supported (65536 bytes)."
        ));
    }
    let mut buf = vec![0u8; byte_length as usize];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut buf);
    Ok(buf)
}

/// Compute a hash digest synchronously. Used by node:crypto createHash.
/// Returns the raw hash bytes.
#[op2]
#[buffer]
pub fn op_crypto_hash_digest(
    #[string] algorithm: String,
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, deno_core::error::AnyError> {
    use ring::digest;
    let algo = match algorithm.to_uppercase().replace('-', "").as_str() {
        "SHA256" | "SHA2256" => &digest::SHA256,
        "SHA384" | "SHA2384" => &digest::SHA384,
        "SHA512" | "SHA2512" => &digest::SHA512,
        "SHA1" => &digest::SHA1_FOR_LEGACY_USE_ONLY,
        _ => {
            return Err(deno_core::anyhow::anyhow!(
                "Unsupported hash algorithm: {}",
                algorithm
            ))
        }
    };
    let result = digest::digest(algo, data);
    Ok(result.as_ref().to_vec())
}

/// Timing-safe comparison of two byte arrays.
#[op2(fast)]
pub fn op_crypto_timing_safe_equal(
    #[buffer] a: &[u8],
    #[buffer] b: &[u8],
) -> Result<bool, deno_core::error::AnyError> {
    if a.len() != b.len() {
        return Err(deno_core::anyhow::anyhow!(
            "Input buffers must have the same byte length"
        ));
    }
    // Constant-time comparison using XOR accumulator to avoid timing side channels
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    Ok(diff == 0)
}

/// Generate random bytes (for node:crypto randomBytes).
/// Limited to 2^31-1 bytes to match Node.js behavior.
#[op2]
#[buffer]
pub fn op_crypto_random_bytes(#[smi] size: u32) -> Result<Vec<u8>, deno_core::error::AnyError> {
    if size > 0x7FFF_FFFF {
        return Err(deno_core::anyhow::anyhow!(
            "RangeError: The value of \"size\" is out of range. It must be >= 0 && <= 2147483647. Received {}",
            size
        ));
    }
    let mut buf = vec![0u8; size as usize];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut buf);
    Ok(buf)
}

/// Get the op declarations for crypto ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_crypto_random_uuid(),
        op_crypto_get_random_values(),
        op_crypto_hash_digest(),
        op_crypto_timing_safe_equal(),
        op_crypto_random_bytes(),
    ]
}

/// JavaScript bootstrap code for crypto.randomUUID(), crypto.getRandomValues(), and crypto.subtle.
pub const CRYPTO_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  if (!globalThis.crypto) {
    globalThis.crypto = {};
  }

  globalThis.crypto.randomUUID = () => Deno.core.ops.op_crypto_random_uuid();

  globalThis.crypto.getRandomValues = (typedArray) => {
    if (!(typedArray instanceof Int8Array ||
          typedArray instanceof Uint8Array ||
          typedArray instanceof Uint8ClampedArray ||
          typedArray instanceof Int16Array ||
          typedArray instanceof Uint16Array ||
          typedArray instanceof Int32Array ||
          typedArray instanceof Uint32Array ||
          typedArray instanceof BigInt64Array ||
          typedArray instanceof BigUint64Array)) {
      throw new TypeError('The provided value is not of type \'(ArrayBufferView)\'');
    }
    if (typedArray.byteLength > 65536) {
      throw new TypeError(
        'QuotaExceededError: The ArrayBuffer/ArrayBufferView size exceeds the maximum supported (65536 bytes).'
      );
    }
    const bytes = Deno.core.ops.op_crypto_get_random_values(typedArray.byteLength);
    const u8View = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      u8View[i] = bytes[i];
    }
    return typedArray;
  };

  // --- CryptoKey wrapper ---
  class CryptoKey {
    #keyId;
    #type;
    #extractable;
    #algorithm;
    #usages;

    constructor(keyId, type, algorithm, extractable, usages) {
      this.#keyId = keyId;
      this.#type = type;
      this.#algorithm = algorithm;
      this.#extractable = extractable;
      this.#usages = Object.freeze([...usages]);
    }

    get type() { return this.#type; }
    get extractable() { return this.#extractable; }
    get algorithm() { return this.#algorithm; }
    get usages() { return this.#usages; }
    get __keyId() { return this.#keyId; }
  }

  function normalizeAlgorithm(algo) {
    if (typeof algo === 'string') return { name: algo };
    return algo;
  }

  function toBytes(data) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    throw new TypeError('data must be BufferSource');
  }

  function makeCryptoKey(result) {
    // Parse internal algorithm string (e.g. "HMAC::SHA-256", "AES-GCM::256",
    // "ECDSA::P-256", "RSASSA-PKCS1-v1_5::SHA-256") into spec-compliant objects.
    let algoObj;
    const algoStr = typeof result.algorithm === 'string' ? result.algorithm : '';
    const parts = algoStr.split('::');
    const name = parts[0] || algoStr;
    const param = parts[1];

    if (name === 'HMAC' && param) {
      algoObj = { name: 'HMAC', hash: { name: param } };
    } else if (name === 'AES-GCM' && param) {
      algoObj = { name: 'AES-GCM', length: parseInt(param, 10) };
    } else if (name === 'ECDSA' && param) {
      algoObj = { name: 'ECDSA', namedCurve: param };
    } else if (name.includes('RSASSA') && param) {
      algoObj = { name: 'RSASSA-PKCS1-v1_5', hash: { name: param } };
    } else if (name === 'HKDF') {
      algoObj = { name: 'HKDF' };
    } else if (typeof result.algorithm === 'object') {
      algoObj = result.algorithm;
    } else {
      algoObj = { name };
    }
    return new CryptoKey(result.keyId, result.keyType, algoObj, result.extractable, result.usages);
  }

  // --- SubtleCrypto ---
  // TODO: Move RSA key generation to tokio::spawn_blocking to avoid
  // blocking the event loop for large key sizes (e.g. 4096-bit).
  class SubtleCrypto {
    async digest(algorithm, data) {
      const algo = normalizeAlgorithm(algorithm);
      const bytes = toBytes(data);
      const result = Deno.core.ops.op_crypto_subtle_digest({
        algorithm: algo.name,
        data: Array.from(bytes),
      });
      return new Uint8Array(result).buffer;
    }

    async importKey(format, keyData, algorithm, extractable, usages) {
      const algo = normalizeAlgorithm(algorithm);
      const bytes = toBytes(keyData);
      const result = Deno.core.ops.op_crypto_subtle_import_key({
        format,
        keyData: Array.from(bytes),
        algorithm: algo,
        extractable,
        usages,
      });
      return makeCryptoKey(result);
    }

    async exportKey(format, key) {
      if (!(key instanceof CryptoKey)) throw new TypeError('key must be a CryptoKey');
      const result = Deno.core.ops.op_crypto_subtle_export_key({
        format,
        keyId: key.__keyId,
      });
      return new Uint8Array(result).buffer;
    }

    async sign(algorithm, key, data) {
      if (!(key instanceof CryptoKey)) throw new TypeError('key must be a CryptoKey');
      const algo = normalizeAlgorithm(algorithm);
      const bytes = toBytes(data);
      const result = Deno.core.ops.op_crypto_subtle_sign({
        algorithm: algo,
        keyId: key.__keyId,
        data: Array.from(bytes),
      });
      return new Uint8Array(result).buffer;
    }

    async verify(algorithm, key, signature, data) {
      if (!(key instanceof CryptoKey)) throw new TypeError('key must be a CryptoKey');
      const algo = normalizeAlgorithm(algorithm);
      const sigBytes = toBytes(signature);
      const dataBytes = toBytes(data);
      return Deno.core.ops.op_crypto_subtle_verify({
        algorithm: algo,
        keyId: key.__keyId,
        signature: Array.from(sigBytes),
        data: Array.from(dataBytes),
      });
    }

    async generateKey(algorithm, extractable, usages) {
      const algo = normalizeAlgorithm(algorithm);
      const result = Deno.core.ops.op_crypto_subtle_generate_key({
        algorithm: algo,
        extractable,
        usages,
      });
      // Result is either a single key or a key pair
      if (result.publicKey && result.privateKey) {
        return {
          publicKey: makeCryptoKey(result.publicKey),
          privateKey: makeCryptoKey(result.privateKey),
        };
      }
      return makeCryptoKey(result);
    }

    async encrypt(algorithm, key, data) {
      if (!(key instanceof CryptoKey)) throw new TypeError('key must be a CryptoKey');
      const algo = normalizeAlgorithm(algorithm);
      const bytes = toBytes(data);
      const ivBytes = algo.iv ? toBytes(algo.iv) : undefined;
      const adBytes = algo.additionalData ? toBytes(algo.additionalData) : undefined;
      const result = Deno.core.ops.op_crypto_subtle_encrypt({
        algorithm: {
          name: algo.name,
          iv: ivBytes ? Array.from(ivBytes) : [],
          additionalData: adBytes ? Array.from(adBytes) : null,
          tagLength: algo.tagLength || null,
        },
        keyId: key.__keyId,
        data: Array.from(bytes),
      });
      return new Uint8Array(result).buffer;
    }

    async decrypt(algorithm, key, data) {
      if (!(key instanceof CryptoKey)) throw new TypeError('key must be a CryptoKey');
      const algo = normalizeAlgorithm(algorithm);
      const bytes = toBytes(data);
      const ivBytes = algo.iv ? toBytes(algo.iv) : undefined;
      const adBytes = algo.additionalData ? toBytes(algo.additionalData) : undefined;
      const result = Deno.core.ops.op_crypto_subtle_decrypt({
        algorithm: {
          name: algo.name,
          iv: ivBytes ? Array.from(ivBytes) : [],
          additionalData: adBytes ? Array.from(adBytes) : null,
          tagLength: algo.tagLength || null,
        },
        keyId: key.__keyId,
        data: Array.from(bytes),
      });
      return new Uint8Array(result).buffer;
    }

    async deriveBits(algorithm, baseKey, length) {
      if (!(baseKey instanceof CryptoKey)) throw new TypeError('baseKey must be a CryptoKey');
      const algo = normalizeAlgorithm(algorithm);
      const saltBytes = algo.salt ? toBytes(algo.salt) : undefined;
      const infoBytes = algo.info ? toBytes(algo.info) : undefined;
      const result = Deno.core.ops.op_crypto_subtle_derive_bits({
        algorithm: {
          name: algo.name,
          hash: algo.hash,
          salt: saltBytes ? Array.from(saltBytes) : null,
          info: infoBytes ? Array.from(infoBytes) : null,
        },
        baseKeyId: baseKey.__keyId,
        length,
      });
      return new Uint8Array(result).buffer;
    }

    async deriveKey(algorithm, baseKey, derivedKeyAlgorithm, extractable, usages) {
      if (!(baseKey instanceof CryptoKey)) throw new TypeError('baseKey must be a CryptoKey');
      const algo = normalizeAlgorithm(algorithm);
      const derivedAlgo = normalizeAlgorithm(derivedKeyAlgorithm);
      const saltBytes = algo.salt ? toBytes(algo.salt) : undefined;
      const infoBytes = algo.info ? toBytes(algo.info) : undefined;
      const result = Deno.core.ops.op_crypto_subtle_derive_key({
        algorithm: {
          name: algo.name,
          hash: algo.hash,
          salt: saltBytes ? Array.from(saltBytes) : null,
          info: infoBytes ? Array.from(infoBytes) : null,
        },
        baseKeyId: baseKey.__keyId,
        derivedAlgorithm: derivedAlgo,
        extractable,
        usages,
      });
      return makeCryptoKey(result);
    }
  }

  globalThis.crypto.subtle = new SubtleCrypto();
  globalThis.CryptoKey = CryptoKey;
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    #[test]
    fn test_crypto_random_uuid_format() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "crypto.randomUUID()").unwrap();
        let uuid_str = result.as_str().unwrap();
        assert_eq!(uuid_str.len(), 36);
        let parts: Vec<&str> = uuid_str.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
        assert!(parts[2].starts_with('4'));
    }

    #[test]
    fn test_crypto_random_uuid_unique() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
            const a = crypto.randomUUID();
            const b = crypto.randomUUID();
            [a, b, a !== b]
        "#,
            )
            .unwrap();
        let arr = result.as_array().unwrap();
        assert!(arr[2].as_bool().unwrap(), "UUIDs should be unique");
    }
}

# Phase 4: Crypto Key Generation (27 failures)

## Context

The `vtz` runtime's `node:crypto` shim exports `generateKeyPairSync` but the Rust op `op_crypto_generate_keypair` doesn't exist. The JS shim (module_loader.rs:2543-2555) already calls `Deno.core.ops.op_crypto_generate_keypair(type, modulusLength)` but must be updated to pass the full options (including `namedCurve` for EC keys). Auth tests in `@vertz/server` and `@vertz/db` use RSA-2048 and EC P-256 key pairs.

Design doc: `plans/2521-vtz-compat-ops.md`

## Tasks

### Task 1: Add `p256` crate and implement `op_crypto_generate_keypair`

**Files:**
- `native/vtz/Cargo.toml` (modified — add `p256` dependency)
- `native/vtz/src/runtime/ops/crypto.rs` (modified)

**What to implement:**

Add to Cargo.toml:
```toml
p256 = { version = "0.13", features = ["pem"] }
```

Add to `crypto.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyPairOptions {
    #[serde(rename = "type")]
    pub key_type: String,
    pub modulus_length: Option<u32>,
    pub named_curve: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyPairResult {
    pub public_key: String,
    pub private_key: String,
}

#[op2]
#[serde]
pub fn op_crypto_generate_keypair(
    #[serde] options: KeyPairOptions,
) -> Result<KeyPairResult, deno_core::error::AnyError> {
    match options.key_type.as_str() {
        "rsa" => generate_rsa_keypair(options.modulus_length.unwrap_or(2048)),
        "ec" => generate_ec_keypair(options.named_curve.as_deref().unwrap_or("P-256")),
        other => Err(deno_core::anyhow::anyhow!("Unsupported key type: {}", other)),
    }
}
```

RSA implementation:
```rust
fn generate_rsa_keypair(modulus_length: u32) -> Result<KeyPairResult, AnyError> {
    use rsa::RsaPrivateKey;
    use rsa::pkcs8::EncodePrivateKey;
    use rsa::pkcs8::EncodePublicKey;

    let mut rng = rand::thread_rng();
    let private_key = RsaPrivateKey::new(&mut rng, modulus_length as usize)?;
    let private_pem = private_key.to_pkcs8_pem(rsa::pkcs8::LineEnding::LF)?;
    let public_pem = private_key.to_public_key().to_public_key_pem(rsa::pkcs8::LineEnding::LF)?;

    Ok(KeyPairResult {
        public_key: public_pem,
        private_key: private_pem.to_string(),
    })
}
```

EC P-256 implementation:
```rust
fn generate_ec_keypair(curve: &str) -> Result<KeyPairResult, AnyError> {
    match curve {
        "P-256" | "prime256v1" => {
            use p256::SecretKey;
            use p256::pkcs8::EncodePrivateKey;
            use p256::elliptic_curve::sec1::ToEncodedPoint;

            let secret_key = SecretKey::random(&mut rand::thread_rng());
            let private_pem = secret_key.to_pkcs8_pem(p256::pkcs8::LineEnding::LF)?;
            let public_key = secret_key.public_key();
            let public_pem = public_key.to_public_key_pem(p256::pkcs8::LineEnding::LF)?;

            Ok(KeyPairResult {
                public_key: public_pem,
                private_key: private_pem.to_string(),
            })
        }
        other => Err(deno_core::anyhow::anyhow!("Unsupported EC curve: {}", other)),
    }
}
```

Register `op_crypto_generate_keypair` in `op_decls()`.

**Acceptance criteria:**
- [ ] RSA-2048 keypair: valid PEM strings (BEGIN PRIVATE KEY / BEGIN PUBLIC KEY)
- [ ] EC P-256 keypair: valid PEM strings
- [ ] Unsupported type throws clear error
- [ ] Unsupported curve throws clear error
- [ ] Rust unit tests for RSA and EC generation
- [ ] PEM output parseable (round-trip test)

---

### Task 2: Fix JS shim to pass full options

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified — lines 2543-2555)

**What to implement:**

Replace the current JS shim:
```javascript
// CURRENT (broken for EC):
function generateKeyPairSync(type, options) {
  if (typeof Deno !== 'undefined' && Deno.core && Deno.core.ops.op_crypto_generate_keypair) {
    const result = Deno.core.ops.op_crypto_generate_keypair(
      type,
      options.modulusLength || 2048
    );
    return {
      publicKey: createPublicKey(result.publicKey),
      privateKey: createPrivateKey(result.privateKey),
    };
  }
  throw new Error('generateKeyPairSync is not supported in the Vertz runtime without the crypto op');
}
```

With:
```javascript
function generateKeyPairSync(type, options) {
  const result = Deno.core.ops.op_crypto_generate_keypair({
    type,
    modulusLength: options.modulusLength,
    namedCurve: options.namedCurve,
  });
  return {
    publicKey: createPublicKey(result.publicKey),
    privateKey: createPrivateKey(result.privateKey),
  };
}
```

Changes:
1. Pass full options as serde object (not positional args)
2. Include `namedCurve` for EC key generation
3. Remove the availability check — op is always present now
4. Remove the error fallback — op handles errors

**Acceptance criteria:**
- [ ] `generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: {...}, privateKeyEncoding: {...} })` returns `{ publicKey, privateKey }` KeyObjects
- [ ] `generateKeyPairSync('ec', { namedCurve: 'P-256', publicKeyEncoding: {...}, privateKeyEncoding: {...} })` returns `{ publicKey, privateKey }` KeyObjects
- [ ] `generateKeyPairSync('ed25519', {})` throws `Unsupported key type: ed25519`
- [ ] JS integration test via `VertzJsRuntime::execute_script`

---

### Task 3: Verify auth test suites

**Files:**
- No file changes — test verification only

**What to verify:**

```bash
vtz test packages/server/src/auth/
vtz test packages/db/
```

**Acceptance criteria:**
- [ ] Server auth tests pass (JWT algorithm config, key pair generation)
- [ ] DB tests pass (if they depend on crypto)
- [ ] 27 failures resolved

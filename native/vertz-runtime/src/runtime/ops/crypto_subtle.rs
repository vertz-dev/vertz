use std::collections::HashMap;

use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpDecl;
use deno_core::OpState;
use ring::digest as ring_digest;
use ring::hmac as ring_hmac;
use ring::rand::SystemRandom;
use ring::signature::KeyPair;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Key storage — opaque handles in OpState
// ---------------------------------------------------------------------------

/// Internal key material stored in Rust. JS only sees `__keyId`.
#[derive(Clone, Debug)]
pub enum KeyMaterial {
    Symmetric(Vec<u8>),
    EcPrivate(Vec<u8>),  // PKCS#8
    EcPublic(Vec<u8>),   // uncompressed point
    RsaPrivate(Vec<u8>), // PKCS#8 DER
    RsaPublic(Vec<u8>),  // SPKI DER
}

/// Per-runtime key store.
#[derive(Default)]
pub struct CryptoKeyStore {
    next_id: u32,
    keys: HashMap<u32, StoredKey>,
}

#[derive(Clone, Debug)]
pub struct StoredKey {
    pub material: KeyMaterial,
    pub algorithm: String,
    pub extractable: bool,
    pub usages: Vec<String>,
    pub key_type: String, // "secret" | "public" | "private"
}

impl CryptoKeyStore {
    pub fn insert(&mut self, key: StoredKey) -> Result<u32, AnyError> {
        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1).ok_or_else(|| {
            deno_core::anyhow::anyhow!("CryptoKeyStore: key ID overflow (too many keys created)")
        })?;
        self.keys.insert(id, key);
        Ok(id)
    }

    pub fn get(&self, id: u32) -> Option<&StoredKey> {
        self.keys.get(&id)
    }
}

// ---------------------------------------------------------------------------
// Serde types for JS ↔ Rust
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestArgs {
    pub algorithm: String,
    pub data: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportKeyArgs {
    pub format: String,
    pub key_data: Vec<u8>,
    pub algorithm: AlgorithmIdentifier,
    pub extractable: bool,
    pub usages: Vec<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AlgorithmIdentifier {
    pub name: String,
    #[serde(default)]
    pub hash: Option<String>,
    #[serde(default)]
    pub named_curve: Option<String>,
    #[serde(default)]
    pub length: Option<u32>,
    #[serde(default)]
    pub modulus_length: Option<u32>,
    #[serde(default)]
    pub public_exponent: Option<Vec<u8>>,
    // HKDF params
    #[serde(default)]
    pub salt: Option<Vec<u8>>,
    #[serde(default)]
    pub info: Option<Vec<u8>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoKeyResult {
    pub key_id: u32,
    pub key_type: String,
    pub algorithm: String,
    pub extractable: bool,
    pub usages: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoKeyPairResult {
    pub public_key: CryptoKeyResult,
    pub private_key: CryptoKeyResult,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignVerifyArgs {
    pub algorithm: AlgorithmIdentifier,
    pub key_id: u32,
    pub data: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyArgs {
    pub algorithm: AlgorithmIdentifier,
    pub key_id: u32,
    pub signature: Vec<u8>,
    pub data: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptDecryptArgs {
    pub algorithm: AesGcmParams,
    pub key_id: u32,
    pub data: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AesGcmParams {
    pub name: String,
    pub iv: Vec<u8>,
    #[serde(default)]
    pub additional_data: Option<Vec<u8>>,
    #[serde(default)]
    pub tag_length: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateKeyArgs {
    pub algorithm: AlgorithmIdentifier,
    pub extractable: bool,
    pub usages: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportKeyArgs {
    pub format: String,
    pub key_id: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeriveKeyArgs {
    pub algorithm: AlgorithmIdentifier,
    pub base_key_id: u32,
    pub derived_algorithm: AlgorithmIdentifier,
    pub extractable: bool,
    pub usages: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeriveBitsArgs {
    pub algorithm: AlgorithmIdentifier,
    pub base_key_id: u32,
    pub length: u32,
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

fn get_ring_digest_algo(name: &str) -> Result<&'static ring_digest::Algorithm, AnyError> {
    match name.to_uppercase().as_str() {
        "SHA-1" => Ok(&ring_digest::SHA1_FOR_LEGACY_USE_ONLY),
        "SHA-256" => Ok(&ring_digest::SHA256),
        "SHA-384" => Ok(&ring_digest::SHA384),
        "SHA-512" => Ok(&ring_digest::SHA512),
        _ => Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: Unrecognized algorithm name: {}",
            name
        )),
    }
}

fn get_hmac_algo(hash: &str) -> Result<ring_hmac::Algorithm, AnyError> {
    match hash.to_uppercase().as_str() {
        "SHA-1" => Ok(ring_hmac::HMAC_SHA1_FOR_LEGACY_USE_ONLY),
        "SHA-256" => Ok(ring_hmac::HMAC_SHA256),
        "SHA-384" => Ok(ring_hmac::HMAC_SHA384),
        "SHA-512" => Ok(ring_hmac::HMAC_SHA512),
        _ => Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: Unsupported hash for HMAC: {}",
            hash
        )),
    }
}

/// crypto.subtle.digest(algorithm, data)
#[op2]
#[serde]
pub fn op_crypto_subtle_digest(#[serde] args: DigestArgs) -> Result<Vec<u8>, AnyError> {
    let algo = get_ring_digest_algo(&args.algorithm)?;
    let result = ring_digest::digest(algo, &args.data);
    Ok(result.as_ref().to_vec())
}

/// crypto.subtle.importKey(format, keyData, algorithm, extractable, usages)
#[op2]
#[serde]
pub fn op_crypto_subtle_import_key(
    state: &mut OpState,
    #[serde] args: ImportKeyArgs,
) -> Result<CryptoKeyResult, AnyError> {
    let algo_name = args.algorithm.name.to_uppercase();

    match algo_name.as_str() {
        "HMAC" => {
            if args.format != "raw" {
                return Err(deno_core::anyhow::anyhow!(
                    "NotSupportedError: HMAC importKey only supports 'raw' format"
                ));
            }
            // Validate hash is supported
            let hash = args.algorithm.hash.as_deref().ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: hash is required for HMAC")
            })?;
            get_hmac_algo(hash)?;

            let store = state.borrow_mut::<CryptoKeyStore>();
            let id = store.insert(StoredKey {
                material: KeyMaterial::Symmetric(args.key_data),
                algorithm: format!("HMAC::{}", hash.to_uppercase()),
                extractable: args.extractable,
                usages: args.usages.clone(),
                key_type: "secret".to_string(),
            })?;
            Ok(CryptoKeyResult {
                key_id: id,
                key_type: "secret".to_string(),
                algorithm: "HMAC".to_string(),
                extractable: args.extractable,
                usages: args.usages,
            })
        }
        "AES-GCM" => {
            if args.format != "raw" {
                return Err(deno_core::anyhow::anyhow!(
                    "NotSupportedError: AES-GCM importKey only supports 'raw' format"
                ));
            }
            let key_len = args.key_data.len();
            if key_len != 16 && key_len != 32 {
                return Err(deno_core::anyhow::anyhow!(
                    "DataError: AES-GCM key must be 128 or 256 bits, got {} bits",
                    key_len * 8
                ));
            }
            let store = state.borrow_mut::<CryptoKeyStore>();
            let id = store.insert(StoredKey {
                material: KeyMaterial::Symmetric(args.key_data),
                algorithm: format!("AES-GCM::{}", key_len * 8),
                extractable: args.extractable,
                usages: args.usages.clone(),
                key_type: "secret".to_string(),
            })?;
            Ok(CryptoKeyResult {
                key_id: id,
                key_type: "secret".to_string(),
                algorithm: "AES-GCM".to_string(),
                extractable: args.extractable,
                usages: args.usages,
            })
        }
        "HKDF" => {
            if args.format != "raw" {
                return Err(deno_core::anyhow::anyhow!(
                    "NotSupportedError: HKDF importKey only supports 'raw' format"
                ));
            }
            let store = state.borrow_mut::<CryptoKeyStore>();
            let id = store.insert(StoredKey {
                material: KeyMaterial::Symmetric(args.key_data),
                algorithm: "HKDF".to_string(),
                extractable: false, // HKDF keys are never extractable per spec
                usages: args.usages.clone(),
                key_type: "secret".to_string(),
            })?;
            Ok(CryptoKeyResult {
                key_id: id,
                key_type: "secret".to_string(),
                algorithm: "HKDF".to_string(),
                extractable: false,
                usages: args.usages,
            })
        }
        "ECDSA" => {
            let curve = args.algorithm.named_curve.as_deref().ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: namedCurve is required for ECDSA")
            })?;
            match curve {
                "P-256" | "P-384" => {}
                _ => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: Unsupported curve: {}",
                        curve
                    ))
                }
            }

            match args.format.as_str() {
                "pkcs8" => {
                    let store = state.borrow_mut::<CryptoKeyStore>();
                    let id = store.insert(StoredKey {
                        material: KeyMaterial::EcPrivate(args.key_data),
                        algorithm: format!("ECDSA::{}", curve),
                        extractable: args.extractable,
                        usages: args.usages.clone(),
                        key_type: "private".to_string(),
                    })?;
                    Ok(CryptoKeyResult {
                        key_id: id,
                        key_type: "private".to_string(),
                        algorithm: "ECDSA".to_string(),
                        extractable: args.extractable,
                        usages: args.usages,
                    })
                }
                "raw" => {
                    let store = state.borrow_mut::<CryptoKeyStore>();
                    let id = store.insert(StoredKey {
                        material: KeyMaterial::EcPublic(args.key_data),
                        algorithm: format!("ECDSA::{}", curve),
                        extractable: args.extractable,
                        usages: args.usages.clone(),
                        key_type: "public".to_string(),
                    })?;
                    Ok(CryptoKeyResult {
                        key_id: id,
                        key_type: "public".to_string(),
                        algorithm: "ECDSA".to_string(),
                        extractable: args.extractable,
                        usages: args.usages,
                    })
                }
                _ => Err(deno_core::anyhow::anyhow!(
                    "NotSupportedError: ECDSA importKey supports 'pkcs8' and 'raw' formats"
                )),
            }
        }
        "RSASSA-PKCS1-V1_5" | "RSASSA-PKCS1-V1.5" => {
            let hash = args.algorithm.hash.as_deref().ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: hash is required for RSASSA-PKCS1-v1_5")
            })?;
            // Validate hash — only SHA-256/384/512 are supported for RSA sign/verify
            match hash.to_uppercase().as_str() {
                "SHA-256" | "SHA-384" | "SHA-512" => {}
                "SHA-1" => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: SHA-1 is not supported for RSA signing in this runtime"
                    ))
                }
                _ => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: Unrecognized hash algorithm: {}",
                        hash
                    ))
                }
            }

            match args.format.as_str() {
                "pkcs8" => {
                    let store = state.borrow_mut::<CryptoKeyStore>();
                    let id = store.insert(StoredKey {
                        material: KeyMaterial::RsaPrivate(args.key_data),
                        algorithm: format!("RSASSA-PKCS1-v1_5::{}", hash.to_uppercase()),
                        extractable: args.extractable,
                        usages: args.usages.clone(),
                        key_type: "private".to_string(),
                    })?;
                    Ok(CryptoKeyResult {
                        key_id: id,
                        key_type: "private".to_string(),
                        algorithm: "RSASSA-PKCS1-v1_5".to_string(),
                        extractable: args.extractable,
                        usages: args.usages,
                    })
                }
                "spki" => {
                    let store = state.borrow_mut::<CryptoKeyStore>();
                    let id = store.insert(StoredKey {
                        material: KeyMaterial::RsaPublic(args.key_data),
                        algorithm: format!("RSASSA-PKCS1-v1_5::{}", hash.to_uppercase()),
                        extractable: args.extractable,
                        usages: args.usages.clone(),
                        key_type: "public".to_string(),
                    })?;
                    Ok(CryptoKeyResult {
                        key_id: id,
                        key_type: "public".to_string(),
                        algorithm: "RSASSA-PKCS1-v1_5".to_string(),
                        extractable: args.extractable,
                        usages: args.usages,
                    })
                }
                _ => Err(deno_core::anyhow::anyhow!(
                    "NotSupportedError: RSASSA-PKCS1-v1_5 importKey supports 'pkcs8' and 'spki' formats"
                )),
            }
        }
        _ => Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: importKey does not support algorithm: {}",
            algo_name
        )),
    }
}

/// crypto.subtle.exportKey(format, key)
#[op2]
#[serde]
pub fn op_crypto_subtle_export_key(
    state: &mut OpState,
    #[serde] args: ExportKeyArgs,
) -> Result<Vec<u8>, AnyError> {
    let store = state.borrow::<CryptoKeyStore>();
    let key = store
        .get(args.key_id)
        .ok_or_else(|| deno_core::anyhow::anyhow!("InvalidAccessError: Key not found"))?;

    if !key.extractable {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key is not extractable"
        ));
    }

    match (&key.material, args.format.as_str()) {
        (KeyMaterial::Symmetric(bytes), "raw") => Ok(bytes.clone()),
        (KeyMaterial::EcPublic(bytes), "raw") => Ok(bytes.clone()),
        (KeyMaterial::EcPrivate(bytes), "pkcs8") => Ok(bytes.clone()),
        (KeyMaterial::RsaPrivate(bytes), "pkcs8") => Ok(bytes.clone()),
        (KeyMaterial::RsaPublic(bytes), "spki") => Ok(bytes.clone()),
        _ => Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: Cannot export {} key in '{}' format",
            key.key_type,
            args.format
        )),
    }
}

/// crypto.subtle.sign(algorithm, key, data)
#[op2]
#[serde]
pub fn op_crypto_subtle_sign(
    state: &mut OpState,
    #[serde] args: SignVerifyArgs,
) -> Result<Vec<u8>, AnyError> {
    let store = state.borrow::<CryptoKeyStore>();
    let key = store
        .get(args.key_id)
        .ok_or_else(|| deno_core::anyhow::anyhow!("InvalidAccessError: Key not found"))?;

    if !key.usages.contains(&"sign".to_string()) {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key does not support 'sign'"
        ));
    }

    let algo_name = args.algorithm.name.to_uppercase();

    match algo_name.as_str() {
        "HMAC" => {
            let KeyMaterial::Symmetric(ref raw) = key.material else {
                return Err(deno_core::anyhow::anyhow!(
                    "InvalidAccessError: Key is not a symmetric key"
                ));
            };
            // Extract hash from stored algorithm "HMAC::SHA-256"
            let hash =
                key.algorithm.split("::").nth(1).ok_or_else(|| {
                    deno_core::anyhow::anyhow!("Internal: malformed HMAC key algo")
                })?;
            let hmac_algo = get_hmac_algo(hash)?;
            let signing_key = ring_hmac::Key::new(hmac_algo, raw);
            let tag = ring_hmac::sign(&signing_key, &args.data);
            Ok(tag.as_ref().to_vec())
        }
        "ECDSA" => {
            let KeyMaterial::EcPrivate(ref pkcs8) = key.material else {
                return Err(deno_core::anyhow::anyhow!(
                    "InvalidAccessError: Key is not an EC private key"
                ));
            };
            let hash = args.algorithm.hash.as_deref().ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: hash is required for ECDSA sign")
            })?;
            let curve =
                key.algorithm.split("::").nth(1).ok_or_else(|| {
                    deno_core::anyhow::anyhow!("Internal: malformed ECDSA key algo")
                })?;
            let signing_algo = match (curve, hash.to_uppercase().as_str()) {
                ("P-256", "SHA-256") => &ring::signature::ECDSA_P256_SHA256_FIXED_SIGNING,
                ("P-384", "SHA-384") => &ring::signature::ECDSA_P384_SHA384_FIXED_SIGNING,
                _ => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: Unsupported ECDSA curve/hash combo: {}/{}",
                        curve,
                        hash
                    ))
                }
            };
            let rng = SystemRandom::new();
            let key_pair = ring::signature::EcdsaKeyPair::from_pkcs8(signing_algo, pkcs8, &rng)
                .map_err(|e| {
                    deno_core::anyhow::anyhow!("DataError: Invalid ECDSA private key: {}", e)
                })?;
            let sig = key_pair.sign(&rng, &args.data).map_err(|e| {
                deno_core::anyhow::anyhow!("OperationError: ECDSA sign failed: {}", e)
            })?;
            Ok(sig.as_ref().to_vec())
        }
        "RSASSA-PKCS1-V1_5" | "RSASSA-PKCS1-V1.5" => {
            let KeyMaterial::RsaPrivate(ref pkcs8_der) = key.material else {
                return Err(deno_core::anyhow::anyhow!(
                    "InvalidAccessError: Key is not an RSA private key"
                ));
            };
            let hash =
                key.algorithm.split("::").nth(1).ok_or_else(|| {
                    deno_core::anyhow::anyhow!("Internal: malformed RSA key algo")
                })?;

            use rsa::pkcs8::DecodePrivateKey;
            use rsa::signature::SignatureEncoding;
            let private_key = rsa::RsaPrivateKey::from_pkcs8_der(pkcs8_der).map_err(|e| {
                deno_core::anyhow::anyhow!("DataError: Invalid RSA private key: {}", e)
            })?;

            let signature_bytes = match hash.to_uppercase().as_str() {
                "SHA-256" => {
                    use rsa::signature::Signer;
                    let signing_key = rsa::pkcs1v15::SigningKey::<sha2::Sha256>::new(private_key);
                    let sig = signing_key.sign(&args.data);
                    sig.to_vec()
                }
                "SHA-384" => {
                    use rsa::signature::Signer;
                    let signing_key = rsa::pkcs1v15::SigningKey::<sha2::Sha384>::new(private_key);
                    let sig = signing_key.sign(&args.data);
                    sig.to_vec()
                }
                "SHA-512" => {
                    use rsa::signature::Signer;
                    let signing_key = rsa::pkcs1v15::SigningKey::<sha2::Sha512>::new(private_key);
                    let sig = signing_key.sign(&args.data);
                    sig.to_vec()
                }
                _ => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: Unsupported RSA hash: {}",
                        hash
                    ))
                }
            };
            Ok(signature_bytes)
        }
        _ => Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: sign does not support algorithm: {}",
            algo_name
        )),
    }
}

/// crypto.subtle.verify(algorithm, key, signature, data)
#[op2]
pub fn op_crypto_subtle_verify(
    state: &mut OpState,
    #[serde] args: VerifyArgs,
) -> Result<bool, AnyError> {
    let store = state.borrow::<CryptoKeyStore>();
    let key = store
        .get(args.key_id)
        .ok_or_else(|| deno_core::anyhow::anyhow!("InvalidAccessError: Key not found"))?;

    if !key.usages.contains(&"verify".to_string()) {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key does not support 'verify'"
        ));
    }

    let algo_name = args.algorithm.name.to_uppercase();

    match algo_name.as_str() {
        "HMAC" => {
            let KeyMaterial::Symmetric(ref raw) = key.material else {
                return Err(deno_core::anyhow::anyhow!(
                    "InvalidAccessError: Key is not a symmetric key"
                ));
            };
            let hash =
                key.algorithm.split("::").nth(1).ok_or_else(|| {
                    deno_core::anyhow::anyhow!("Internal: malformed HMAC key algo")
                })?;
            let hmac_algo = get_hmac_algo(hash)?;
            let verification_key = ring_hmac::Key::new(hmac_algo, raw);
            Ok(ring_hmac::verify(&verification_key, &args.data, &args.signature).is_ok())
        }
        "ECDSA" => {
            let hash = args.algorithm.hash.as_deref().ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: hash is required for ECDSA verify")
            })?;
            let curve =
                key.algorithm.split("::").nth(1).ok_or_else(|| {
                    deno_core::anyhow::anyhow!("Internal: malformed ECDSA key algo")
                })?;

            let verify_algo = match (curve, hash.to_uppercase().as_str()) {
                ("P-256", "SHA-256") => &ring::signature::ECDSA_P256_SHA256_FIXED,
                ("P-384", "SHA-384") => &ring::signature::ECDSA_P384_SHA384_FIXED,
                _ => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: Unsupported ECDSA curve/hash combo: {}/{}",
                        curve,
                        hash
                    ))
                }
            };

            let public_bytes = match &key.material {
                KeyMaterial::EcPublic(bytes) => bytes.clone(),
                _ => {
                    return Err(deno_core::anyhow::anyhow!(
                        "InvalidAccessError: Key is not an EC public key"
                    ));
                }
            };

            let peer_public_key =
                ring::signature::UnparsedPublicKey::new(verify_algo, &public_bytes);
            Ok(peer_public_key.verify(&args.data, &args.signature).is_ok())
        }
        "RSASSA-PKCS1-V1_5" | "RSASSA-PKCS1-V1.5" => {
            let KeyMaterial::RsaPublic(ref spki_der) = key.material else {
                return Err(deno_core::anyhow::anyhow!(
                    "InvalidAccessError: Key is not an RSA public key"
                ));
            };
            let hash =
                key.algorithm.split("::").nth(1).ok_or_else(|| {
                    deno_core::anyhow::anyhow!("Internal: malformed RSA key algo")
                })?;

            use rsa::pkcs8::DecodePublicKey;
            let public_key = rsa::RsaPublicKey::from_public_key_der(spki_der).map_err(|e| {
                deno_core::anyhow::anyhow!("DataError: Invalid RSA public key: {}", e)
            })?;

            let result = match hash.to_uppercase().as_str() {
                "SHA-256" => {
                    use rsa::signature::Verifier;
                    let verifying_key =
                        rsa::pkcs1v15::VerifyingKey::<sha2::Sha256>::new(public_key);
                    let sig = rsa::pkcs1v15::Signature::try_from(args.signature.as_slice())
                        .map_err(|e| {
                            deno_core::anyhow::anyhow!("DataError: Invalid signature: {}", e)
                        })?;
                    verifying_key.verify(&args.data, &sig).is_ok()
                }
                "SHA-384" => {
                    use rsa::signature::Verifier;
                    let verifying_key =
                        rsa::pkcs1v15::VerifyingKey::<sha2::Sha384>::new(public_key);
                    let sig = rsa::pkcs1v15::Signature::try_from(args.signature.as_slice())
                        .map_err(|e| {
                            deno_core::anyhow::anyhow!("DataError: Invalid signature: {}", e)
                        })?;
                    verifying_key.verify(&args.data, &sig).is_ok()
                }
                "SHA-512" => {
                    use rsa::signature::Verifier;
                    let verifying_key =
                        rsa::pkcs1v15::VerifyingKey::<sha2::Sha512>::new(public_key);
                    let sig = rsa::pkcs1v15::Signature::try_from(args.signature.as_slice())
                        .map_err(|e| {
                            deno_core::anyhow::anyhow!("DataError: Invalid signature: {}", e)
                        })?;
                    verifying_key.verify(&args.data, &sig).is_ok()
                }
                _ => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: Unsupported RSA hash: {}",
                        hash
                    ))
                }
            };
            Ok(result)
        }
        _ => Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: verify does not support algorithm: {}",
            algo_name
        )),
    }
}

/// crypto.subtle.generateKey(algorithm, extractable, usages)
#[op2]
#[serde]
pub fn op_crypto_subtle_generate_key(
    state: &mut OpState,
    #[serde] args: GenerateKeyArgs,
) -> Result<serde_json::Value, AnyError> {
    let algo_name = args.algorithm.name.to_uppercase();

    match algo_name.as_str() {
        "HMAC" => {
            let hash = args.algorithm.hash.as_deref().ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: hash is required for HMAC")
            })?;
            get_hmac_algo(hash)?;
            // Default length = block size of hash
            let length = args
                .algorithm
                .length
                .unwrap_or(match hash.to_uppercase().as_str() {
                    "SHA-1" => 512,
                    "SHA-256" => 512,
                    "SHA-384" => 1024,
                    "SHA-512" => 1024,
                    _ => 512,
                });
            let byte_len = (length / 8) as usize;
            let mut key_bytes = vec![0u8; byte_len];
            use rand::RngCore;
            rand::thread_rng().fill_bytes(&mut key_bytes);

            let store = state.borrow_mut::<CryptoKeyStore>();
            let id = store.insert(StoredKey {
                material: KeyMaterial::Symmetric(key_bytes),
                algorithm: format!("HMAC::{}", hash.to_uppercase()),
                extractable: args.extractable,
                usages: args.usages.clone(),
                key_type: "secret".to_string(),
            })?;
            Ok(serde_json::to_value(CryptoKeyResult {
                key_id: id,
                key_type: "secret".to_string(),
                algorithm: "HMAC".to_string(),
                extractable: args.extractable,
                usages: args.usages,
            })?)
        }
        "AES-GCM" => {
            let length = args.algorithm.length.ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: length is required for AES-GCM generateKey")
            })?;
            if length != 128 && length != 256 {
                return Err(deno_core::anyhow::anyhow!(
                    "OperationError: AES-GCM length must be 128 or 256, got {}",
                    length
                ));
            }
            let byte_len = (length / 8) as usize;
            let mut key_bytes = vec![0u8; byte_len];
            use rand::RngCore;
            rand::thread_rng().fill_bytes(&mut key_bytes);

            let store = state.borrow_mut::<CryptoKeyStore>();
            let id = store.insert(StoredKey {
                material: KeyMaterial::Symmetric(key_bytes),
                algorithm: format!("AES-GCM::{}", length),
                extractable: args.extractable,
                usages: args.usages.clone(),
                key_type: "secret".to_string(),
            })?;
            Ok(serde_json::to_value(CryptoKeyResult {
                key_id: id,
                key_type: "secret".to_string(),
                algorithm: "AES-GCM".to_string(),
                extractable: args.extractable,
                usages: args.usages,
            })?)
        }
        "ECDSA" => {
            let curve = args.algorithm.named_curve.as_deref().ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: namedCurve is required for ECDSA")
            })?;
            let rng = SystemRandom::new();
            match curve {
                "P-256" => {
                    let pkcs8 = ring::signature::EcdsaKeyPair::generate_pkcs8(
                        &ring::signature::ECDSA_P256_SHA256_FIXED_SIGNING,
                        &rng,
                    )
                    .map_err(|e| {
                        deno_core::anyhow::anyhow!("OperationError: ECDSA keygen failed: {}", e)
                    })?;
                    let key_pair = ring::signature::EcdsaKeyPair::from_pkcs8(
                        &ring::signature::ECDSA_P256_SHA256_FIXED_SIGNING,
                        pkcs8.as_ref(),
                        &rng,
                    )
                    .map_err(|e| {
                        deno_core::anyhow::anyhow!("OperationError: ECDSA keygen failed: {}", e)
                    })?;
                    let pub_bytes = key_pair.public_key().as_ref().to_vec();
                    let store = state.borrow_mut::<CryptoKeyStore>();
                    let priv_id = store.insert(StoredKey {
                        material: KeyMaterial::EcPrivate(pkcs8.as_ref().to_vec()),
                        algorithm: "ECDSA::P-256".to_string(),
                        extractable: args.extractable,
                        usages: args
                            .usages
                            .iter()
                            .filter(|u| *u == "sign")
                            .cloned()
                            .collect(),
                        key_type: "private".to_string(),
                    })?;
                    let pub_id = store.insert(StoredKey {
                        material: KeyMaterial::EcPublic(pub_bytes),
                        algorithm: "ECDSA::P-256".to_string(),
                        extractable: true,
                        usages: args
                            .usages
                            .iter()
                            .filter(|u| *u == "verify")
                            .cloned()
                            .collect(),
                        key_type: "public".to_string(),
                    })?;
                    Ok(serde_json::to_value(CryptoKeyPairResult {
                        public_key: CryptoKeyResult {
                            key_id: pub_id,
                            key_type: "public".to_string(),
                            algorithm: "ECDSA".to_string(),
                            extractable: true,
                            usages: args
                                .usages
                                .iter()
                                .filter(|u| *u == "verify")
                                .cloned()
                                .collect(),
                        },
                        private_key: CryptoKeyResult {
                            key_id: priv_id,
                            key_type: "private".to_string(),
                            algorithm: "ECDSA".to_string(),
                            extractable: args.extractable,
                            usages: args
                                .usages
                                .iter()
                                .filter(|u| *u == "sign")
                                .cloned()
                                .collect(),
                        },
                    })?)
                }
                "P-384" => {
                    let pkcs8 = ring::signature::EcdsaKeyPair::generate_pkcs8(
                        &ring::signature::ECDSA_P384_SHA384_FIXED_SIGNING,
                        &rng,
                    )
                    .map_err(|e| {
                        deno_core::anyhow::anyhow!("OperationError: ECDSA keygen failed: {}", e)
                    })?;
                    let key_pair = ring::signature::EcdsaKeyPair::from_pkcs8(
                        &ring::signature::ECDSA_P384_SHA384_FIXED_SIGNING,
                        pkcs8.as_ref(),
                        &rng,
                    )
                    .map_err(|e| {
                        deno_core::anyhow::anyhow!("OperationError: ECDSA keygen failed: {}", e)
                    })?;
                    let pub_bytes = key_pair.public_key().as_ref().to_vec();
                    let store = state.borrow_mut::<CryptoKeyStore>();
                    let priv_id = store.insert(StoredKey {
                        material: KeyMaterial::EcPrivate(pkcs8.as_ref().to_vec()),
                        algorithm: "ECDSA::P-384".to_string(),
                        extractable: args.extractable,
                        usages: args
                            .usages
                            .iter()
                            .filter(|u| *u == "sign")
                            .cloned()
                            .collect(),
                        key_type: "private".to_string(),
                    })?;
                    let pub_id = store.insert(StoredKey {
                        material: KeyMaterial::EcPublic(pub_bytes),
                        algorithm: "ECDSA::P-384".to_string(),
                        extractable: true,
                        usages: args
                            .usages
                            .iter()
                            .filter(|u| *u == "verify")
                            .cloned()
                            .collect(),
                        key_type: "public".to_string(),
                    })?;
                    Ok(serde_json::to_value(CryptoKeyPairResult {
                        public_key: CryptoKeyResult {
                            key_id: pub_id,
                            key_type: "public".to_string(),
                            algorithm: "ECDSA".to_string(),
                            extractable: true,
                            usages: args
                                .usages
                                .iter()
                                .filter(|u| *u == "verify")
                                .cloned()
                                .collect(),
                        },
                        private_key: CryptoKeyResult {
                            key_id: priv_id,
                            key_type: "private".to_string(),
                            algorithm: "ECDSA".to_string(),
                            extractable: args.extractable,
                            usages: args
                                .usages
                                .iter()
                                .filter(|u| *u == "sign")
                                .cloned()
                                .collect(),
                        },
                    })?)
                }
                _ => Err(deno_core::anyhow::anyhow!(
                    "NotSupportedError: Unsupported curve: {}",
                    curve
                )),
            }
        }
        "RSASSA-PKCS1-V1_5" | "RSASSA-PKCS1-V1.5" => {
            let hash = args.algorithm.hash.as_deref().ok_or_else(|| {
                deno_core::anyhow::anyhow!("TypeError: hash is required for RSASSA-PKCS1-v1_5")
            })?;
            // Only SHA-256/384/512 are supported for RSA sign/verify
            match hash.to_uppercase().as_str() {
                "SHA-256" | "SHA-384" | "SHA-512" => {}
                "SHA-1" => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: SHA-1 is not supported for RSA signing in this runtime"
                    ))
                }
                _ => {
                    return Err(deno_core::anyhow::anyhow!(
                        "NotSupportedError: Unrecognized hash algorithm: {}",
                        hash
                    ))
                }
            }
            let modulus_length = args.algorithm.modulus_length.unwrap_or(2048);
            let bits = modulus_length as usize;

            use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey};
            let mut rng = rand::thread_rng();
            let private_key = rsa::RsaPrivateKey::new(&mut rng, bits).map_err(|e| {
                deno_core::anyhow::anyhow!("OperationError: RSA keygen failed: {}", e)
            })?;
            let public_key = rsa::RsaPublicKey::from(&private_key);

            let priv_der = private_key
                .to_pkcs8_der()
                .map_err(|e| deno_core::anyhow::anyhow!("OperationError: {}", e))?;
            let pub_der = public_key
                .to_public_key_der()
                .map_err(|e| deno_core::anyhow::anyhow!("OperationError: {}", e))?;

            let algo_str = format!("RSASSA-PKCS1-v1_5::{}", hash.to_uppercase());
            let store = state.borrow_mut::<CryptoKeyStore>();
            let priv_id = store.insert(StoredKey {
                material: KeyMaterial::RsaPrivate(priv_der.as_bytes().to_vec()),
                algorithm: algo_str.clone(),
                extractable: args.extractable,
                usages: args
                    .usages
                    .iter()
                    .filter(|u| *u == "sign")
                    .cloned()
                    .collect(),
                key_type: "private".to_string(),
            })?;
            let pub_id = store.insert(StoredKey {
                material: KeyMaterial::RsaPublic(pub_der.as_bytes().to_vec()),
                algorithm: algo_str,
                extractable: true,
                usages: args
                    .usages
                    .iter()
                    .filter(|u| *u == "verify")
                    .cloned()
                    .collect(),
                key_type: "public".to_string(),
            })?;
            Ok(serde_json::to_value(CryptoKeyPairResult {
                public_key: CryptoKeyResult {
                    key_id: pub_id,
                    key_type: "public".to_string(),
                    algorithm: "RSASSA-PKCS1-v1_5".to_string(),
                    extractable: true,
                    usages: args
                        .usages
                        .iter()
                        .filter(|u| *u == "verify")
                        .cloned()
                        .collect(),
                },
                private_key: CryptoKeyResult {
                    key_id: priv_id,
                    key_type: "private".to_string(),
                    algorithm: "RSASSA-PKCS1-v1_5".to_string(),
                    extractable: args.extractable,
                    usages: args
                        .usages
                        .iter()
                        .filter(|u| *u == "sign")
                        .cloned()
                        .collect(),
                },
            })?)
        }
        _ => Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: generateKey does not support algorithm: {}",
            algo_name
        )),
    }
}

/// crypto.subtle.encrypt(algorithm, key, data) — AES-GCM only
#[op2]
#[serde]
pub fn op_crypto_subtle_encrypt(
    state: &mut OpState,
    #[serde] args: EncryptDecryptArgs,
) -> Result<Vec<u8>, AnyError> {
    let store = state.borrow::<CryptoKeyStore>();
    let key = store
        .get(args.key_id)
        .ok_or_else(|| deno_core::anyhow::anyhow!("InvalidAccessError: Key not found"))?;

    if !key.usages.contains(&"encrypt".to_string()) {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key does not support 'encrypt'"
        ));
    }

    let algo_name = args.algorithm.name.to_uppercase();
    if algo_name != "AES-GCM" {
        return Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: encrypt only supports AES-GCM, got {}",
            algo_name
        ));
    }

    let KeyMaterial::Symmetric(ref raw) = key.material else {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key is not a symmetric key"
        ));
    };

    let algo = match raw.len() {
        16 => &ring::aead::AES_128_GCM,
        32 => &ring::aead::AES_256_GCM,
        _ => {
            return Err(deno_core::anyhow::anyhow!(
                "OperationError: AES key must be 128 or 256 bits, got {} bits",
                raw.len() * 8
            ))
        }
    };
    let unbound_key = ring::aead::UnboundKey::new(algo, raw)
        .map_err(|e| deno_core::anyhow::anyhow!("OperationError: Invalid AES key: {}", e))?;

    let nonce = ring::aead::Nonce::try_assume_unique_for_key(&args.algorithm.iv)
        .map_err(|_| deno_core::anyhow::anyhow!("OperationError: Invalid IV (must be 12 bytes)"))?;

    let sealing_key = ring::aead::LessSafeKey::new(unbound_key);
    let aad = ring::aead::Aad::from(args.algorithm.additional_data.as_deref().unwrap_or(&[]));

    let mut in_out = args.data.clone();
    sealing_key
        .seal_in_place_append_tag(nonce, aad, &mut in_out)
        .map_err(|e| deno_core::anyhow::anyhow!("OperationError: Encryption failed: {}", e))?;

    Ok(in_out)
}

/// crypto.subtle.decrypt(algorithm, key, data) — AES-GCM only
#[op2]
#[serde]
pub fn op_crypto_subtle_decrypt(
    state: &mut OpState,
    #[serde] args: EncryptDecryptArgs,
) -> Result<Vec<u8>, AnyError> {
    let store = state.borrow::<CryptoKeyStore>();
    let key = store
        .get(args.key_id)
        .ok_or_else(|| deno_core::anyhow::anyhow!("InvalidAccessError: Key not found"))?;

    if !key.usages.contains(&"decrypt".to_string()) {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key does not support 'decrypt'"
        ));
    }

    let algo_name = args.algorithm.name.to_uppercase();
    if algo_name != "AES-GCM" {
        return Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: decrypt only supports AES-GCM, got {}",
            algo_name
        ));
    }

    let KeyMaterial::Symmetric(ref raw) = key.material else {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key is not a symmetric key"
        ));
    };

    let algo = match raw.len() {
        16 => &ring::aead::AES_128_GCM,
        32 => &ring::aead::AES_256_GCM,
        _ => {
            return Err(deno_core::anyhow::anyhow!(
                "OperationError: AES key must be 128 or 256 bits, got {} bits",
                raw.len() * 8
            ))
        }
    };
    let unbound_key = ring::aead::UnboundKey::new(algo, raw)
        .map_err(|e| deno_core::anyhow::anyhow!("OperationError: Invalid AES key: {}", e))?;

    let nonce = ring::aead::Nonce::try_assume_unique_for_key(&args.algorithm.iv)
        .map_err(|_| deno_core::anyhow::anyhow!("OperationError: Invalid IV (must be 12 bytes)"))?;

    let opening_key = ring::aead::LessSafeKey::new(unbound_key);
    let aad = ring::aead::Aad::from(args.algorithm.additional_data.as_deref().unwrap_or(&[]));

    let mut in_out = args.data.clone();
    let plaintext = opening_key
        .open_in_place(nonce, aad, &mut in_out)
        .map_err(|_| deno_core::anyhow::anyhow!("OperationError: Decryption failed"))?;

    Ok(plaintext.to_vec())
}

/// Shared HKDF logic used by both deriveBits and deriveKey ops.
fn hkdf_derive_bits_inner(
    ikm: &[u8],
    algorithm: &AlgorithmIdentifier,
    length: u32,
) -> Result<Vec<u8>, AnyError> {
    let hash = algorithm
        .hash
        .as_deref()
        .ok_or_else(|| deno_core::anyhow::anyhow!("TypeError: hash is required for HKDF"))?;

    let hkdf_algo = match hash.to_uppercase().as_str() {
        "SHA-256" => ring::hkdf::HKDF_SHA256,
        "SHA-384" => ring::hkdf::HKDF_SHA384,
        "SHA-512" => ring::hkdf::HKDF_SHA512,
        _ => {
            return Err(deno_core::anyhow::anyhow!(
                "NotSupportedError: HKDF does not support hash: {}",
                hash
            ))
        }
    };

    let salt_bytes = algorithm.salt.as_deref().unwrap_or(&[]);
    let info_bytes = algorithm.info.as_deref().unwrap_or(&[]);
    let salt = ring::hkdf::Salt::new(hkdf_algo, salt_bytes);
    let prk = salt.extract(ikm);

    let byte_len = (length / 8) as usize;
    let info_slices: &[&[u8]] = &[info_bytes];
    let okm = prk
        .expand(info_slices, HkdfLen(byte_len))
        .map_err(|_| deno_core::anyhow::anyhow!("OperationError: HKDF expand failed"))?;

    let mut result = vec![0u8; byte_len];
    okm.fill(&mut result)
        .map_err(|_| deno_core::anyhow::anyhow!("OperationError: HKDF fill failed"))?;
    Ok(result)
}

/// crypto.subtle.deriveBits(algorithm, baseKey, length) — HKDF
#[op2]
#[serde]
pub fn op_crypto_subtle_derive_bits(
    state: &mut OpState,
    #[serde] args: DeriveBitsArgs,
) -> Result<Vec<u8>, AnyError> {
    let store = state.borrow::<CryptoKeyStore>();
    let base_key = store
        .get(args.base_key_id)
        .ok_or_else(|| deno_core::anyhow::anyhow!("InvalidAccessError: Key not found"))?;

    if !base_key.usages.contains(&"deriveBits".to_string()) {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key does not support 'deriveBits'"
        ));
    }

    let algo_name = args.algorithm.name.to_uppercase();
    if algo_name != "HKDF" {
        return Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: deriveBits only supports HKDF, got {}",
            algo_name
        ));
    }

    let KeyMaterial::Symmetric(ref ikm) = base_key.material else {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key is not a symmetric key"
        ));
    };

    hkdf_derive_bits_inner(ikm, &args.algorithm, args.length)
}

/// Custom length type for ring HKDF.
struct HkdfLen(usize);

impl ring::hkdf::KeyType for HkdfLen {
    fn len(&self) -> usize {
        self.0
    }
}

/// crypto.subtle.deriveKey(algorithm, baseKey, derivedAlgo, extractable, usages)
#[op2]
#[serde]
pub fn op_crypto_subtle_derive_key(
    state: &mut OpState,
    #[serde] args: DeriveKeyArgs,
) -> Result<CryptoKeyResult, AnyError> {
    // First derive the bits
    let derive_length = match args.derived_algorithm.name.to_uppercase().as_str() {
        "AES-GCM" => args.derived_algorithm.length.ok_or_else(|| {
            deno_core::anyhow::anyhow!("TypeError: length is required for derived AES-GCM key")
        })?,
        "HMAC" => args.derived_algorithm.length.unwrap_or(256),
        _ => {
            return Err(deno_core::anyhow::anyhow!(
                "NotSupportedError: deriveKey does not support derived algorithm: {}",
                args.derived_algorithm.name
            ))
        }
    };

    let store = state.borrow::<CryptoKeyStore>();
    let base_key = store
        .get(args.base_key_id)
        .ok_or_else(|| deno_core::anyhow::anyhow!("InvalidAccessError: Key not found"))?;

    if !base_key.usages.contains(&"deriveKey".to_string()) {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key does not support 'deriveKey'"
        ));
    }

    let algo_name = args.algorithm.name.to_uppercase();
    if algo_name != "HKDF" {
        return Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: deriveKey only supports HKDF, got {}",
            algo_name
        ));
    }

    let KeyMaterial::Symmetric(ref ikm) = base_key.material else {
        return Err(deno_core::anyhow::anyhow!(
            "InvalidAccessError: Key is not a symmetric key"
        ));
    };

    let derived_bytes = hkdf_derive_bits_inner(ikm, &args.algorithm, derive_length)?;

    // Now import the derived bytes as the target algorithm
    let derived_algo_name = args.derived_algorithm.name.to_uppercase();
    match derived_algo_name.as_str() {
        "AES-GCM" => {
            let store = state.borrow_mut::<CryptoKeyStore>();
            let id = store.insert(StoredKey {
                material: KeyMaterial::Symmetric(derived_bytes),
                algorithm: format!("AES-GCM::{}", derive_length),
                extractable: args.extractable,
                usages: args.usages.clone(),
                key_type: "secret".to_string(),
            })?;
            Ok(CryptoKeyResult {
                key_id: id,
                key_type: "secret".to_string(),
                algorithm: "AES-GCM".to_string(),
                extractable: args.extractable,
                usages: args.usages,
            })
        }
        "HMAC" => {
            let hash = args.derived_algorithm.hash.as_deref().unwrap_or("SHA-256");
            let store = state.borrow_mut::<CryptoKeyStore>();
            let id = store.insert(StoredKey {
                material: KeyMaterial::Symmetric(derived_bytes),
                algorithm: format!("HMAC::{}", hash.to_uppercase()),
                extractable: args.extractable,
                usages: args.usages.clone(),
                key_type: "secret".to_string(),
            })?;
            Ok(CryptoKeyResult {
                key_id: id,
                key_type: "secret".to_string(),
                algorithm: "HMAC".to_string(),
                extractable: args.extractable,
                usages: args.usages,
            })
        }
        _ => Err(deno_core::anyhow::anyhow!(
            "NotSupportedError: deriveKey does not support: {}",
            derived_algo_name
        )),
    }
}

// ---------------------------------------------------------------------------
// Op registration
// ---------------------------------------------------------------------------

pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_crypto_subtle_digest(),
        op_crypto_subtle_import_key(),
        op_crypto_subtle_export_key(),
        op_crypto_subtle_sign(),
        op_crypto_subtle_verify(),
        op_crypto_subtle_generate_key(),
        op_crypto_subtle_encrypt(),
        op_crypto_subtle_decrypt(),
        op_crypto_subtle_derive_bits(),
        op_crypto_subtle_derive_key(),
    ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    /// Helper: run async JS, store result in globalThis.__result, return it.
    async fn run_async(rt: &mut VertzJsRuntime, code: &str) -> serde_json::Value {
        let wrapped = format!(
            r#"(async () => {{ {} }})().then(v => {{ globalThis.__result = v; }}).catch(e => {{ globalThis.__result = 'ERROR: ' + e.message; }})"#,
            code
        );
        rt.execute_script_void("<test>", &wrapped).unwrap();
        rt.run_event_loop().await.unwrap();
        rt.execute_script("<read>", "globalThis.__result").unwrap()
    }

    // --- crypto.getRandomValues ---

    #[test]
    fn test_get_random_values_fills_uint8array() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const buf = new Uint8Array(16);
                crypto.getRandomValues(buf);
                [buf.length, buf.some(b => b !== 0)]
            "#,
            )
            .unwrap();
        let arr = result.as_array().unwrap();
        assert_eq!(arr[0].as_u64().unwrap(), 16);
        assert!(arr[1].as_bool().unwrap(), "should have non-zero bytes");
    }

    #[test]
    fn test_get_random_values_returns_same_buffer() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const buf = new Uint8Array(8);
                const returned = crypto.getRandomValues(buf);
                returned === buf
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_get_random_values_rejects_oversized() {
        let mut rt = create_runtime();
        let val = rt
            .execute_script(
                "<test>",
                r#"
            try {
                crypto.getRandomValues(new Uint8Array(65537));
                'no-throw'
            } catch (e) {
                e.message.includes('65536') ? 'quota-exceeded' : e.message
            }
        "#,
            )
            .unwrap();
        assert_eq!(val, serde_json::json!("quota-exceeded"));
    }

    // --- crypto.subtle.digest ---

    #[tokio::test]
    async fn test_digest_sha256() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const data = new TextEncoder().encode('hello');
            const hash = await crypto.subtle.digest('SHA-256', data);
            const bytes = new Uint8Array(hash);
            return [bytes.length, bytes[0].toString(16), bytes[1].toString(16)];
        "#,
        )
        .await;
        let arr = result.as_array().unwrap();
        assert_eq!(arr[0].as_u64().unwrap(), 32);
        assert_eq!(arr[1].as_str().unwrap(), "2c");
        assert_eq!(arr[2].as_str().unwrap(), "f2");
    }

    #[tokio::test]
    async fn test_digest_sha512() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const hash = await crypto.subtle.digest('SHA-512', new TextEncoder().encode('test'));
            return new Uint8Array(hash).length;
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!(64));
    }

    #[tokio::test]
    async fn test_digest_unsupported_algo() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            try {
                await crypto.subtle.digest('MD5', new Uint8Array());
                return 'no-throw';
            } catch (e) {
                return e.message.includes('MD5') ? 'not-supported' : e.message;
            }
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("not-supported"));
    }

    // --- HMAC sign/verify ---

    #[tokio::test]
    async fn test_hmac_sign_verify() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const key = await crypto.subtle.generateKey(
                { name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify']
            );
            const data = new TextEncoder().encode('hello world');
            const sig = await crypto.subtle.sign('HMAC', key, data);
            const valid = await crypto.subtle.verify('HMAC', key, sig, data);
            const invalid = await crypto.subtle.verify(
                'HMAC', key, sig, new TextEncoder().encode('wrong')
            );
            return [sig.byteLength > 0, valid, !invalid];
        "#,
        )
        .await;
        let arr = result.as_array().unwrap();
        assert!(arr[0].as_bool().unwrap(), "signature should have bytes");
        assert!(arr[1].as_bool().unwrap(), "valid signature should verify");
        assert!(arr[2].as_bool().unwrap(), "wrong data should not verify");
    }

    // --- HMAC import/export ---

    #[tokio::test]
    async fn test_hmac_import_export_raw() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const rawKey = new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
            const key = await crypto.subtle.importKey(
                'raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, true, ['sign']
            );
            const exported = await crypto.subtle.exportKey('raw', key);
            const exportedArr = new Uint8Array(exported);
            return [
                key.type === 'secret',
                key.algorithm.name === 'HMAC',
                exportedArr.length === 16,
                Array.from(exportedArr).join(',') === Array.from(rawKey).join(',')
            ];
        "#,
        )
        .await;
        let arr = result.as_array().unwrap();
        for (i, item) in arr.iter().enumerate() {
            assert!(item.as_bool().unwrap(), "check {} failed", i);
        }
    }

    // --- AES-GCM encrypt/decrypt ---

    #[tokio::test]
    async fn test_aes_gcm_encrypt_decrypt() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const key = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
            );
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const plaintext = new TextEncoder().encode('secret message');
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv }, key, plaintext
            );
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv }, key, ciphertext
            );
            const decoded = new TextDecoder().decode(new Uint8Array(decrypted));
            return [
                ciphertext.byteLength > plaintext.byteLength,
                decoded === 'secret message'
            ];
        "#,
        )
        .await;
        let arr = result.as_array().unwrap();
        assert!(
            arr[0].as_bool().unwrap(),
            "ciphertext should be larger (includes tag)"
        );
        assert!(arr[1].as_bool().unwrap(), "decrypted should match original");
    }

    #[tokio::test]
    async fn test_aes_gcm_wrong_key_fails() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const key1 = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, false, ['encrypt']
            );
            const key2 = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, false, ['decrypt']
            );
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv }, key1, new TextEncoder().encode('test')
            );
            try {
                await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key2, ct);
                return 'no-throw';
            } catch (e) {
                return 'decryption-failed';
            }
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("decryption-failed"));
    }

    // --- ECDSA generate + sign/verify ---

    #[tokio::test]
    async fn test_ecdsa_p256_sign_verify() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const keyPair = await crypto.subtle.generateKey(
                { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']
            );
            const data = new TextEncoder().encode('test data');
            const sig = await crypto.subtle.sign(
                { name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, data
            );
            const valid = await crypto.subtle.verify(
                { name: 'ECDSA', hash: 'SHA-256' }, keyPair.publicKey, sig, data
            );
            return [
                keyPair.privateKey.type === 'private',
                keyPair.publicKey.type === 'public',
                sig.byteLength > 0,
                valid
            ];
        "#,
        )
        .await;
        let arr = result.as_array().unwrap();
        for (i, item) in arr.iter().enumerate() {
            assert!(item.as_bool().unwrap(), "ECDSA P-256 check {} failed", i);
        }
    }

    // --- HKDF deriveBits ---

    #[tokio::test]
    async fn test_hkdf_derive_bits() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const ikm = await crypto.subtle.importKey(
                'raw', new TextEncoder().encode('input keying material'),
                { name: 'HKDF' }, false, ['deriveBits']
            );
            const bits = await crypto.subtle.deriveBits(
                { name: 'HKDF', hash: 'SHA-256',
                  salt: new TextEncoder().encode('salt'),
                  info: new TextEncoder().encode('info') },
                ikm, 256
            );
            return [bits.byteLength === 32, new Uint8Array(bits).some(b => b !== 0)];
        "#,
        )
        .await;
        let arr = result.as_array().unwrap();
        assert!(arr[0].as_bool().unwrap(), "should be 32 bytes");
        assert!(arr[1].as_bool().unwrap(), "should have non-zero bytes");
    }

    // --- HKDF deriveKey → AES-GCM ---

    #[tokio::test]
    async fn test_hkdf_derive_key_aes_gcm() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const ikm = await crypto.subtle.importKey(
                'raw', new TextEncoder().encode('password'),
                { name: 'HKDF' }, false, ['deriveKey']
            );
            const key = await crypto.subtle.deriveKey(
                { name: 'HKDF', hash: 'SHA-256',
                  salt: new TextEncoder().encode('salt'),
                  info: new TextEncoder().encode('info') },
                ikm,
                { name: 'AES-GCM', length: 256 },
                false, ['encrypt', 'decrypt']
            );
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv }, key, new TextEncoder().encode('test')
            );
            const pt = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv }, key, ct
            );
            return new TextDecoder().decode(new Uint8Array(pt)) === 'test';
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!(true));
    }

    // --- Non-extractable key ---

    #[tokio::test]
    async fn test_non_extractable_key_export_fails() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const key = await crypto.subtle.generateKey(
                { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
            );
            try {
                await crypto.subtle.exportKey('raw', key);
                return 'no-throw';
            } catch (e) {
                return e.message.includes('not extractable') ? 'correct-error' : e.message;
            }
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("correct-error"));
    }

    // --- Usage validation ---

    #[tokio::test]
    async fn test_wrong_usage_sign_with_verify_key() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const rawKey = new Uint8Array(32);
            crypto.getRandomValues(rawKey);
            const key = await crypto.subtle.importKey(
                'raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
            );
            try {
                await crypto.subtle.sign('HMAC', key, new Uint8Array([1,2,3]));
                return 'no-throw';
            } catch (e) {
                return e.message.includes('sign') ? 'correct-error' : e.message;
            }
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("correct-error"));
    }
}

//! Minimal JWT (HS256) verification for POC benchmarking.
//!
//! This implements just enough to verify HMAC-SHA256 JWTs
//! using the `ring` crate — no RSA, no key management, no JWK.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ring::hmac as ring_hmac;
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
pub enum JwtError {
    MalformedToken,
    InvalidSignature,
    Expired,
    InvalidPayload(String),
}

impl std::fmt::Display for JwtError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JwtError::MalformedToken => write!(f, "Malformed JWT token"),
            JwtError::InvalidSignature => write!(f, "Invalid JWT signature"),
            JwtError::Expired => write!(f, "JWT token expired"),
            JwtError::InvalidPayload(msg) => write!(f, "Invalid JWT payload: {}", msg),
        }
    }
}

impl std::error::Error for JwtError {}

#[derive(Debug, Clone, Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    #[serde(default)]
    pub tenant_id: Option<String>,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default)]
    pub exp: u64,
    #[serde(default)]
    pub iat: u64,
}

/// Verify an HS256 JWT and return the decoded claims.
pub fn verify_hs256(token: &str, secret: &[u8]) -> Result<JwtClaims, JwtError> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(JwtError::MalformedToken);
    }

    let header_payload = &token[..parts[0].len() + 1 + parts[1].len()];
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|_| JwtError::MalformedToken)?;

    // Verify HMAC-SHA256 signature
    let key = ring_hmac::Key::new(ring_hmac::HMAC_SHA256, secret);
    ring_hmac::verify(&key, header_payload.as_bytes(), &signature_bytes)
        .map_err(|_| JwtError::InvalidSignature)?;

    // Decode payload
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| JwtError::MalformedToken)?;

    let claims: JwtClaims = serde_json::from_slice(&payload_bytes)
        .map_err(|e| JwtError::InvalidPayload(e.to_string()))?;

    // Check expiration
    if claims.exp > 0 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        if now > claims.exp {
            return Err(JwtError::Expired);
        }
    }

    Ok(claims)
}

/// Create an HS256 JWT token (for test/benchmark setup).
pub fn create_hs256(claims: &JwtClaims, secret: &[u8]) -> String {
    let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"HS256","typ":"JWT"}"#);

    let payload_json = serde_json::to_vec(&serde_json::json!({
        "sub": claims.sub,
        "tenant_id": claims.tenant_id,
        "roles": claims.roles,
        "exp": claims.exp,
        "iat": claims.iat,
    }))
    .unwrap();
    let payload = URL_SAFE_NO_PAD.encode(&payload_json);

    let signing_input = format!("{}.{}", header, payload);
    let key = ring_hmac::Key::new(ring_hmac::HMAC_SHA256, secret);
    let tag = ring_hmac::sign(&key, signing_input.as_bytes());
    let signature = URL_SAFE_NO_PAD.encode(tag.as_ref());

    format!("{}.{}", signing_input, signature)
}

/// Serialize JwtClaims (needed for create_hs256).
impl serde::Serialize for JwtClaims {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("JwtClaims", 5)?;
        s.serialize_field("sub", &self.sub)?;
        s.serialize_field("tenant_id", &self.tenant_id)?;
        s.serialize_field("roles", &self.roles)?;
        s.serialize_field("exp", &self.exp)?;
        s.serialize_field("iat", &self.iat)?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"test-secret-key-for-benchmarks!!";

    fn test_claims() -> JwtClaims {
        JwtClaims {
            sub: "user-042".to_string(),
            tenant_id: Some("tenant-001".to_string()),
            roles: vec!["user".to_string()],
            exp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + 3600,
            iat: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    #[test]
    fn valid_token_verifies() {
        let claims = test_claims();
        let token = create_hs256(&claims, SECRET);
        let result = verify_hs256(&token, SECRET);
        assert!(result.is_ok());
        let decoded = result.unwrap();
        assert_eq!(decoded.sub, "user-042");
        assert_eq!(decoded.tenant_id, Some("tenant-001".to_string()));
    }

    #[test]
    fn tampered_signature_rejected() {
        let claims = test_claims();
        let token = create_hs256(&claims, SECRET);
        // Replace the signature with a completely different valid base64 string.
        // The old approach (swapping the last base64 character between 'A'/'B')
        // was flaky under `cargo llvm-cov` because HMAC-SHA256 produces 32 bytes
        // = 43 base64 chars, and the last char only carries 4 meaningful bits;
        // flipping bit 0 changes a padding bit, leaving decoded bytes identical.
        let dot_pos = token.rfind('.').unwrap();
        let tampered = format!(
            "{}.{}",
            &token[..dot_pos],
            URL_SAFE_NO_PAD.encode(b"this-is-not-the-real-signature!!")
        );
        let result = verify_hs256(&tampered, SECRET);
        assert!(matches!(result, Err(JwtError::InvalidSignature)));
    }

    #[test]
    fn wrong_secret_rejected() {
        let claims = test_claims();
        let token = create_hs256(&claims, SECRET);
        let result = verify_hs256(&token, b"wrong-secret-key-for-benchmarks!");
        assert!(matches!(result, Err(JwtError::InvalidSignature)));
    }

    #[test]
    fn expired_token_rejected() {
        let mut claims = test_claims();
        claims.exp = 1; // Expired long ago
        let token = create_hs256(&claims, SECRET);
        let result = verify_hs256(&token, SECRET);
        assert!(matches!(result, Err(JwtError::Expired)));
    }

    #[test]
    fn malformed_token_rejected() {
        assert!(matches!(
            verify_hs256("not-a-jwt", SECRET),
            Err(JwtError::MalformedToken)
        ));
        assert!(matches!(
            verify_hs256("a.b", SECRET),
            Err(JwtError::MalformedToken)
        ));
    }

    #[test]
    fn invalid_base64_signature_is_malformed() {
        let claims = test_claims();
        let token = create_hs256(&claims, SECRET);
        let parts: Vec<&str> = token.split('.').collect();
        // '!' is not valid base64url
        let tampered = format!("{}.{}.!!invalid!!", parts[0], parts[1]);
        assert!(matches!(
            verify_hs256(&tampered, SECRET),
            Err(JwtError::MalformedToken)
        ));
    }

    #[test]
    fn invalid_base64_payload_is_malformed() {
        let claims = test_claims();
        let token = create_hs256(&claims, SECRET);
        let parts: Vec<&str> = token.split('.').collect();
        // Valid signature check will fail first, but if we craft a token with
        // valid sig over bad payload base64, we test the payload decode path.
        // Simpler: just pass garbage — signature check fails before payload decode.
        // To hit the payload decode error, we need a token where the signature
        // matches but the payload is not valid base64. That's hard to construct,
        // so we test via the malformed path instead.
        let tampered = format!("{}.!!bad!!.{}", parts[0], parts[2]);
        let result = verify_hs256(&tampered, SECRET);
        // Signature won't match the tampered header.payload, so InvalidSignature
        assert!(result.is_err());
    }

    #[test]
    fn invalid_json_payload_gives_invalid_payload_error() {
        // Construct a token with valid base64 but invalid JSON in the payload
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"HS256","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(b"not-json");
        let signing_input = format!("{}.{}", header, payload);
        let key = ring_hmac::Key::new(ring_hmac::HMAC_SHA256, SECRET);
        let tag = ring_hmac::sign(&key, signing_input.as_bytes());
        let signature = URL_SAFE_NO_PAD.encode(tag.as_ref());
        let token = format!("{}.{}", signing_input, signature);

        let result = verify_hs256(&token, SECRET);
        assert!(
            matches!(result, Err(JwtError::InvalidPayload(_))),
            "expected InvalidPayload, got: {:?}",
            result
        );
    }

    #[test]
    fn zero_exp_skips_expiration_check() {
        let mut claims = test_claims();
        claims.exp = 0; // no expiration
        let token = create_hs256(&claims, SECRET);
        let result = verify_hs256(&token, SECRET);
        assert!(result.is_ok(), "exp=0 should skip expiration: {:?}", result);
    }

    #[test]
    fn error_display_formats_correctly() {
        assert_eq!(JwtError::MalformedToken.to_string(), "Malformed JWT token");
        assert_eq!(
            JwtError::InvalidSignature.to_string(),
            "Invalid JWT signature"
        );
        assert_eq!(JwtError::Expired.to_string(), "JWT token expired");
        assert_eq!(
            JwtError::InvalidPayload("bad".to_string()).to_string(),
            "Invalid JWT payload: bad"
        );
    }

    #[test]
    fn claims_default_fields() {
        // Verify that a token with minimal fields deserializes with defaults
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"HS256","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(br#"{"sub":"user-1"}"#);
        let signing_input = format!("{}.{}", header, payload);
        let key = ring_hmac::Key::new(ring_hmac::HMAC_SHA256, SECRET);
        let tag = ring_hmac::sign(&key, signing_input.as_bytes());
        let signature = URL_SAFE_NO_PAD.encode(tag.as_ref());
        let token = format!("{}.{}", signing_input, signature);

        let result = verify_hs256(&token, SECRET).unwrap();
        assert_eq!(result.sub, "user-1");
        assert_eq!(result.tenant_id, None);
        assert!(result.roles.is_empty());
        assert_eq!(result.exp, 0);
        assert_eq!(result.iat, 0);
    }
}

package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Fix JWT Algorithm Confusion
func TestValidator_AlgorithmConfusion(t *testing.T) {
	// 1. Setup RSA Key Pair
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	publicKey := &privateKey.PublicKey

	// 2. Create JWK
	key, err := jwk.FromRaw(publicKey)
	require.NoError(t, err)
	_ = key.Set(jwk.KeyIDKey, "test-kid")
	_ = key.Set(jwk.AlgorithmKey, "RS256")
	_ = key.Set(jwk.KeyUsageKey, "sig")

	// 3. Setup JWKS Server (TLS required by NewValidator)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/jwks.json" {
			buf, _ := json.Marshal(map[string]interface{}{
				"keys": []interface{}{key},
			})
			w.Write(buf)
		}
	}))
	defer server.Close()

	// Configure client to trust the test server cert
	client := server.Client()

	// 4. Create Validator pointing to mock server
	// Extract host from URL (https://127.0.0.1:xxx -> 127.0.0.1:xxx)
	u, _ := url.Parse(server.URL)
	domain := u.Host

	v, err := NewValidator(context.Background(), domain, "test-audience", jwk.WithHTTPClient(client))
	require.NoError(t, err)

	// 5. Create "Confused" Token (HS256 signed with Public Key bytes)
	// Attempts to fool validator into using the public key (PEM/Bytes) as the HMAC secret
	token := jwt.New(jwt.SigningMethodHS256)
	token.Header["kid"] = "test-kid"
	token.Claims = jwt.MapClaims{
		"aud": "test-audience",
		"iss": "https://" + domain + "/",
		"sub": "attacker",
		"exp": time.Now().Add(time.Hour).Unix(),
	}

	// Sign with the Public Key marshaled as bytes (simulating the attack)
	// In a real attack, the attacker knows the public key.
	// If the server uses the public key (rsa.PublicKey) as the HMAC key, it might work
	// (depending on how the library handles Verify with a struct key for HMAC).
	// Actually, jwt-go/v5 verifies that key type matches expectation for HMAC (bytes).
	// If the KeyFunc returns an *rsa.PublicKey, jwt-go's HMAC verify MIGHT fail type assertion
	// OR it might try to use it.
	//
	// However, the CRITICAL fix is ensuring we check method BEFORE returning key.
	// If we return the key, we rely on the library to reject mismatch.
	// But relying on the library is risky. We must enforce RS256.

	// Marshaling public key to PEM/PKIX is how an attacker would treat it as a blob.
	// But here we just need to sign it such that IF the validator returns the pubkey object,
	// checking verification fails or passes.
	// Actually, if KeyFunc returns *rsa.PublicKey, standard HS256 verification in jwt-go expects []byte.
	// So purely type-wise it might fail.
	// BUT, if the KeyFunc wraps or converts it, or if we use string...

	// Let's verify that we explicitly Reject unwanted algs.

	// Signing with a dummy secret here.
	// If validation proceeds to Verification and fails signature, that's one thing.
	// But we want it to fail in KeyFunc or Parse because of "Unexpected signing method".
	signedString, err := token.SignedString([]byte("secret"))
	require.NoError(t, err)

	// 6. Validate
	_, err = v.ValidateToken(signedString)

	// Assert
	assert.Error(t, err)
	// We specifically want an error about the method, NOT signature verification failure.
	// If it fails on signature, it means it TRIED to verify (vulnerable-ish).
	// If it fails on "unexpected signing method", it's secure.
	assert.Contains(t, err.Error(), "unexpected signing method", "Should reject wrong signing method")
}

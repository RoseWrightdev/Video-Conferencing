package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Test Helpers ---
// setupTestKeys generates a new RSA key pair for testing.
func setupTestKeys(t *testing.T) *rsa.PrivateKey {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err, "Failed to generate RSA private key")
	return privateKey
}

// startMockJWKSServer creates an HTTPS test server that serves a JWKS from a public key.
func startMockJWKSServer(t *testing.T, rsaKey *rsa.PrivateKey) *httptest.Server {
	publicKey, err := jwk.FromRaw(&rsaKey.PublicKey)
	require.NoError(t, err)
	require.NoError(t, publicKey.Set(jwk.KeyIDKey, "test-kid"))
	require.NoError(t, publicKey.Set(jwk.AlgorithmKey, "RS256"))

	keySet := jwk.NewSet()
	require.NoError(t, keySet.AddKey(publicKey))

	// Use NewTLSServer to create an HTTPS server.
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		err := json.NewEncoder(w).Encode(keySet)
		require.NoError(t, err)
	}))

	return server
}

// createTestJWT creates a signed JWT for testing.
func createTestJWT(t *testing.T, privateKey *rsa.PrivateKey, claims jwt.Claims) string {
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = "test-kid" // Set the key ID to match the JWKS

	tokenString, err := token.SignedString(privateKey)
	require.NoError(t, err, "Failed to sign test JWT")
	return tokenString
}

// --- Tests ---

func TestNewValidator(t *testing.T) {
	privateKey := setupTestKeys(t)
	mockServer := startMockJWKSServer(t, privateKey)
	defer mockServer.Close()

	mockDomain := strings.TrimPrefix(mockServer.URL, "https://")

	t.Run("should create validator successfully with valid config", func(t *testing.T) {
		// Create register options to inject the trusted client.
		regOpt := jwk.WithHTTPClient(mockServer.Client())

		validator, err := NewValidator(context.Background(), mockDomain, "test-audience", regOpt)
		require.NoError(t, err)
		require.NotNil(t, validator)
		assert.Equal(t, "https://"+mockDomain+"/", validator.issuer)
		assert.Contains(t, validator.audience, "test-audience")
	})

	t.Run("should fail with invalid domain", func(t *testing.T) {
		_, err := NewValidator(context.Background(), " a bad domain", "test-audience")
		assert.Error(t, err)
	})

	t.Run("should fail if jwks endpoint is unreachable", func(t *testing.T) {
		unreachableServer := startMockJWKSServer(t, privateKey)
		unreachableDomain := strings.TrimPrefix(unreachableServer.URL, "https://")
		unreachableServer.Close()

		_, err := NewValidator(context.Background(), unreachableDomain, "test-audience")
		assert.Error(t, err, "Should fail when JWKS endpoint cannot be reached on startup")
	})
}

func TestValidateToken(t *testing.T) {
	privateKey := setupTestKeys(t)
	mockServer := startMockJWKSServer(t, privateKey)
	defer mockServer.Close()
	mockDomain := strings.TrimPrefix(mockServer.URL, "https://")

	// Create a validator that trusts the mock server.
	regOpt := jwk.WithHTTPClient(mockServer.Client())
	validator, err := NewValidator(context.Background(), mockDomain, "test-audience", regOpt)
	require.NoError(t, err)

	t.Run("should validate a valid token successfully", func(t *testing.T) {
		claims := &CustomClaims{
			Scope: "read:messages",
			RegisteredClaims: jwt.RegisteredClaims{
				Issuer:    "https://" + mockDomain + "/",
				Subject:   "user-123",
				Audience:  jwt.ClaimStrings{"test-audience"},
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
			},
		}
		tokenString := createTestJWT(t, privateKey, claims)

		validatedClaims, err := validator.ValidateToken(tokenString)
		require.NoError(t, err)
		require.NotNil(t, validatedClaims)
		assert.Equal(t, "user-123", validatedClaims.Subject)
		assert.Equal(t, "read:messages", validatedClaims.Scope)
	})

	t.Run("should fail an expired token", func(t *testing.T) {
		claims := &CustomClaims{
			RegisteredClaims: jwt.RegisteredClaims{
				Issuer:    "https://" + mockDomain + "/",
				Audience:  jwt.ClaimStrings{"test-audience"},
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)), // Expired
			},
		}
		tokenString := createTestJWT(t, privateKey, claims)
		_, err := validator.ValidateToken(tokenString)
		assert.Error(t, err)
		// **FIX:** The error message is simpler than what was previously asserted.
		assert.Contains(t, err.Error(), "token is expired")
	})

	t.Run("should fail a token with wrong issuer", func(t *testing.T) {
		claims := &CustomClaims{
			RegisteredClaims: jwt.RegisteredClaims{
				Issuer:    "https://wrong-issuer.com/", // Wrong issuer
				Audience:  jwt.ClaimStrings{"test-audience"},
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		tokenString := createTestJWT(t, privateKey, claims)
		_, err := validator.ValidateToken(tokenString)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "token has invalid issuer")
	})

	t.Run("should fail a token with wrong signature", func(t *testing.T) {
		wrongPrivateKey := setupTestKeys(t) // A different key
		claims := &CustomClaims{
			RegisteredClaims: jwt.RegisteredClaims{
				Issuer:    "https://" + mockDomain + "/",
				Audience:  jwt.ClaimStrings{"test-audience"},
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		tokenString := createTestJWT(t, wrongPrivateKey, claims)
		_, err := validator.ValidateToken(tokenString)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "signature is invalid")
	})
}

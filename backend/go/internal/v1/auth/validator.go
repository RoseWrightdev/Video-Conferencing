package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/golang-jwt/jwt/v5"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"go.uber.org/zap"
)

// CustomClaims represents custom JWT claims used for authentication.
// It embeds jwt.RegisteredClaims and adds a Scope field to specify the user's access scope.
type CustomClaims struct {
	Scope string `json:"scope"`
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
	jwt.RegisteredClaims
}

// Validator provides JWT validation functionality, including key retrieval,
// issuer verification, and audience checks.
type Validator struct {
	keyFunc  jwt.Keyfunc
	issuer   string
	audience []string
}

// NewValidator creates a new Validator instance for JWT validation using JWKS from the specified domain.
// It parses the issuer URL, registers the JWKS endpoint with a cache, and ensures initial connectivity
// by fetching the keys. The function allows additional jwk.RegisterOption parameters for customization,
// which are combined with a default refresh interval. The returned Validator uses a keyFunc that retrieves
// the appropriate public key for JWT verification based on the "kid" header.
//
// Parameters:
//
//	ctx      - Context for cancellation and timeout control.
//	domain   - The domain to construct the issuer and JWKS URLs.
//	audience - The expected audience claim for JWT validation.
//	regOpts  - Optional jwk.RegisterOption values for JWKS cache registration.
//
// Returns:
//
//	*Validator - A configured Validator ready for JWT validation.
//	error      - An error if any step in the setup fails (e.g., URL parsing, JWKS registration, key fetching)
func NewValidator(ctx context.Context, domain, audience string, regOpts ...jwk.RegisterOption) (*Validator, error) {
	issuerURL, err := url.Parse("https://" + domain + "/")
	if err != nil {
		return nil, fmt.Errorf("failed to parse issuer URL: %w", err)
	}

	jwksURL := issuerURL.JoinPath(".well-known/jwks.json").String()

	cache := jwk.NewCache(ctx)

	// Combine default options with any provided options for testability.
	opts := []jwk.RegisterOption{jwk.WithRefreshInterval(1 * time.Hour)}
	opts = append(opts, regOpts...)

	// Register the JWKS URL with the combined options.
	err = cache.Register(jwksURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to register JWKS URL in cache: %w", err)
	}

	// Fetch the keys for the first time to ensure connectivity.
	_, err = cache.Refresh(ctx, jwksURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch initial JWKS: %w", err)
	}

	keyFunc := func(token *jwt.Token) (interface{}, error) {
		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, errors.New("kid header not found")
		}

		keys, err := cache.Get(ctx, jwksURL)
		if err != nil {
			return nil, fmt.Errorf("failed to get keys from cache: %w", err)
		}

		key, found := keys.LookupKeyID(kid)
		if !found {
			return nil, fmt.Errorf("key with kid %s not found", kid)
		}

		var pubKey interface{}
		if err := key.Raw(&pubKey); err != nil {
			return nil, fmt.Errorf("failed to get raw public key: %w", err)
		}

		return pubKey, nil
	}

	return &Validator{
		keyFunc:  keyFunc,
		issuer:   issuerURL.String(),
		audience: []string{audience},
	}, nil
}

// ValidateToken parses and validates a JWT token string using the configured key function,
// issuer, and audience. It returns the token's custom claims if the token is valid.
// If the token is invalid or cannot be parsed, an error is returned.
//
// Parameters:
//   - tokenString: the JWT token string to validate.
//
// Returns:
//   - *CustomClaims: the custom claims extracted from the token if valid.
//   - error: an error if the token is invalid or parsing fails.
func (v *Validator) ValidateToken(tokenString string) (*CustomClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, v.keyFunc,
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(v.audience[0]),
	)

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if !token.Valid {
		return nil, errors.New("token is invalid")
	}

	claims, ok := token.Claims.(*CustomClaims)
	if !ok {
		return nil, errors.New("failed to cast claims to CustomClaims")
	}

	return claims, nil
}

func GetAllowedOriginsFromEnv(envVarName string, defaultEnvs []string) []string {
	// Example: ALLOWED_ORIGINS="http://localhost:3000,https://your-app.com"
	originsStr := os.Getenv(envVarName)
	if originsStr == "" {
		// Provide sensible defaults for local development if the env var isn't set.
		logging.Warn(context.Background(), fmt.Sprintf("%s environment variable not set. Using default development origins:\n%s", envVarName, defaultEnvs))
		return defaultEnvs
	}
	return strings.Split(originsStr, ",")
}

// MockValidator is a development-only token validator that accepts any token
type MockValidator struct{}

func (m *MockValidator) ValidateToken(tokenString string) (*CustomClaims, error) {
	// For development, parse the JWT token to extract the real 'sub' claim
	// This ensures the clientId matches between frontend and backend
	var subject, name, email string

	// Parse JWT token (format: header.payload.signature)
	parts := strings.Split(tokenString, ".")
	if len(parts) == 3 {
		// Decode the payload (base64 URL encoded)
		payload, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err == nil {
			var claims map[string]interface{}
			if json.Unmarshal(payload, &claims) == nil {
				if sub, ok := claims["sub"].(string); ok {
					subject = sub
				}
				if n, ok := claims["name"].(string); ok {
					name = n
				}
				if e, ok := claims["email"].(string); ok {
					email = e
				}
				// Debug: log what we found
				logging.Info(context.Background(), "MockValidator parsed JWT", zap.String("subject", subject), zap.String("name", name), zap.String("email", email))
			}
		}
	}

	// Fallback to default if parsing failed
	if subject == "" {
		subject = "dev-user-123"
	}
	if name == "" {
		name = "Dev User"
	}
	if email == "" {
		email = "dev@example.com"
	}

	claims := &CustomClaims{
		Name:  name,
		Email: email,
	}
	claims.Subject = subject
	return claims, nil
}

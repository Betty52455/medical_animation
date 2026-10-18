package utils

import (
	"testing"
	"time"
	"website_test/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

// configureJWTTestKey 临时设置独立测试密钥，测试结束后恢复全局配置。
func configureJWTTestKey(t *testing.T) {
	t.Helper()
	previous := config.GlobalConfig.JWTSecret
	config.GlobalConfig.JWTSecret = "test-only-independent-signing-key-2026"
	// 恢复测试前的配置，避免影响同一包中的其他测试。
	t.Cleanup(func() { config.GlobalConfig.JWTSecret = previous })
}

// TestTokenRoundTrip 验证签发和解析保留用户身份及有效期。
func TestTokenRoundTrip(t *testing.T) {
	configureJWTTestKey(t)
	token, err := GenerateToken(42, "admin")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != 42 || claims.Role != "admin" || claims.ExpiresAt == nil {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

// TestRejectLegacyDefaultKey 防止继续接受使用旧公开默认密钥伪造的管理员令牌。
func TestRejectLegacyDefaultKey(t *testing.T) {
	configureJWTTestKey(t)
	claims := Claims{UserID: 1, Role: "admin", RegisteredClaims: jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("your-secret-key-change-in-prod"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseToken(token); err == nil {
		t.Fatal("accepted token signed with the legacy default key")
	}
}

// TestRejectUnexpectedSigningMethod 防止同一密钥用于非 HS256 算法的令牌。
func TestRejectUnexpectedSigningMethod(t *testing.T) {
	configureJWTTestKey(t)
	claims := Claims{UserID: 1, Role: "admin", RegisteredClaims: jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS384, claims).SignedString([]byte(config.GlobalConfig.JWTSecret))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseToken(token); err == nil {
		t.Fatal("accepted a token using an unexpected signing algorithm")
	}
}

// TestRejectMissingExpiration 防止无有效期令牌绕过会话过期限制。
func TestRejectMissingExpiration(t *testing.T) {
	configureJWTTestKey(t)
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{UserID: 1, Role: "admin"}).SignedString([]byte(config.GlobalConfig.JWTSecret))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseToken(token); err == nil {
		t.Fatal("accepted token without expiration")
	}
}

// TestRejectEmptySigningKey 验证配置缺失时既不签发令牌也不接受令牌。
func TestRejectEmptySigningKey(t *testing.T) {
	configureJWTTestKey(t)
	config.GlobalConfig.JWTSecret = ""
	if _, err := GenerateToken(1, "admin"); err == nil {
		t.Fatal("issued token with empty signing key")
	}
	if _, err := ParseToken("invalid"); err == nil {
		t.Fatal("accepted token with empty signing key")
	}
}

// TestRejectExpiredToken 验证过期令牌不能访问受保护接口。
func TestRejectExpiredToken(t *testing.T) {
	configureJWTTestKey(t)
	claims := Claims{UserID: 1, Role: "admin", RegisteredClaims: jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
	}}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.GlobalConfig.JWTSecret))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseToken(token); err == nil {
		t.Fatal("accepted expired token")
	}
}

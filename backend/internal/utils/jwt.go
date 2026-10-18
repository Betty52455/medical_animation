package utils

import (
	"errors"
	"time"
	"website_test/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID uint   `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// jwtSigningKey 从已加载的配置获取签名密钥，拒绝使用空密钥签发或验证令牌。
func jwtSigningKey() ([]byte, error) {
	if config.GlobalConfig.JWTSecret == "" {
		return nil, errors.New("jwt_secret must not be empty")
	}
	return []byte(config.GlobalConfig.JWTSecret), nil
}

// GenerateToken 使用生产配置的 HS256 密钥签发有效期为 24 小时的登录令牌。
func GenerateToken(userID uint, role string) (string, error) {
	key, err := jwtSigningKey()
	if err != nil {
		return "", err
	}
	claims := Claims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(key)
}

// ParseToken 只接受使用当前配置密钥签名、带有效期且尚未过期的 HS256 令牌。
func ParseToken(tokenString string) (*Claims, error) {
	key, err := jwtSigningKey()
	if err != nil {
		return nil, err
	}

	// 签名算法由解析器限制；回调仅提供当前生产配置中的密钥。
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("invalid token")
}

package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"website_test/internal/database"
	"website_test/internal/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestValidateRegistrationPassword 覆盖短密码、规律密码和可用的长短语。
func TestValidateRegistrationPassword(t *testing.T) {
	tests := []struct {
		name     string
		username string
		password string
		wantBad  bool
	}{
		{"short digits", "alice", "123456", true},
		{"short letters", "alice", "ABCD", true},
		{"all ones", "alice", "111111111111111", true},
		{"all twos", "alice", "222222222222222", true},
		{"all threes", "alice", "333333333333333", true},
		{"alternating", "alice", "121212121212121", true},
		{"two chars near repetition", "alice", "111111111111112", true},
		{"number sequence", "alice", "123456789012345", true},
		{"letter sequence", "alice", "abcdefghijklmnop", true},
		{"repeated segment", "alice", "AbcdAbcdAbcdAbcd", true},
		{"username in password", "alice", "MyAlicePassphrase2026", true},
		{"common long password", "alice", "Password123456789", true},
		{"bcrypt byte limit", "alice", strings.Repeat("中", 25), true},
		{"memorable passphrase", "alice", "蓝色纸船驶向远方的灯塔2026", false},
		{"long ascii passphrase", "alice", "river-cloud-window-candle-27", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			issue := validateRegistrationPassword(test.username, test.password)
			if (issue != "") != test.wantBad {
				t.Fatalf("issue = %q, wantBad = %v", issue, test.wantBad)
			}
		})
	}
}

// TestRegisterRejectsWeakPassword 确认直接调用 API 也无法绕过页面校验。
func TestRegisterRejectsWeakPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/register", Register)
	request := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{"username":"alice","password":"111111111111111","confirm_password":"111111111111111"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"field":"password"`) {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

// TestRegisterAcceptsPassphrase 确认合格密码可以真实注册，并以 bcrypt 哈希入库。
func TestRegisterAcceptsPassphrase(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "register.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatal(err)
	}
	previousDB := database.DB
	database.DB = db
	t.Cleanup(func() { database.DB = previousDB })

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/register", Register)
	password := "river-cloud-window-candle-27"
	request := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{"username":"alice","password":"`+password+`","confirm_password":"`+password+`"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var user models.User
	if err := db.Where("username = ?", "alice").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	if user.PasswordHash == password || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		t.Fatal("registered password was not stored as a usable hash")
	}
}

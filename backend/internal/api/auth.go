package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
	"website_test/internal/database"
	"website_test/internal/models"
	"website_test/internal/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type RegisterRequest struct {
	Username        string `json:"username" binding:"required"`
	Password        string `json:"password" binding:"required"`
	ConfirmPassword string `json:"confirm_password" binding:"required"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Register 校验用户名和密码，并只为符合新规则的账户生成密码哈希。
func Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Password != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "两次输入的密码不一致"})
		return
	}

	// 用户名正则校验：必须以字母开头，可以包含字母、数字、下划线、中文
	matched, _ := regexp.MatchString(`^[a-zA-Z][a-zA-Z0-9_\p{Han}]*$`, req.Username)
	if !matched {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名必须以字母开头，只能包含字母、数字、下划线或中文"})
		return
	}
	if issue := validateRegistrationPassword(req.Username, req.Password); issue != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": issue, "field": "password"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败: " + err.Error()})
		return
	}

	user := models.User{
		Username:     req.Username,
		PasswordHash: string(hashedPassword),
		Role:         "user",
	}

	// 检查用户名是否已存在
	var count int64
	database.DB.Model(&models.User{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该用户名已注册"})
		return
	}

	if err := database.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "注册失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "注册成功"})
}

// validateRegistrationPassword 拒绝过短、超出 bcrypt 限制和明显可猜测的密码。
func validateRegistrationPassword(username, password string) string {
	if utf8.RuneCountInString(password) < 15 {
		return "密码至少需要15个字符，建议使用一段容易记住的长短语"
	}
	if len([]byte(password)) > 72 {
		return "密码的 UTF-8 编码不能超过72字节，请缩短后重试"
	}

	lower := strings.ToLower(password)
	name := strings.ToLower(username)
	if utf8.RuneCountInString(name) >= 3 && strings.Contains(lower, name) {
		return "密码不能包含用户名，请换一段不相关的长短语"
	}
	if hasPredictablePattern([]rune(lower)) {
		return "密码不能使用连续字符、重复字符或重复片段"
	}
	commonLongPasswords := map[string]bool{
		"password12345678":  true,
		"password123456789": true,
		"qwerty123456789":   true,
		"qwertyuiop123456":  true,
		"iloveyou12345678":  true,
		"letmein123456789":  true,
	}
	if commonLongPasswords[lower] {
		return "这个密码太常见，请换一段不容易被猜到的长短语"
	}
	return ""
}

// hasPredictablePattern 识别少量字符拼凑、短片段循环及连续数字或字母。
func hasPredictablePattern(chars []rune) bool {
	unique := make(map[rune]bool)
	for _, char := range chars {
		unique[char] = true
	}
	if len(unique) <= 2 {
		return true
	}

	for period := 1; period <= len(chars)/2; period++ {
		repeated := true
		for index, char := range chars {
			if char != chars[index%period] {
				repeated = false
				break
			}
		}
		if repeated {
			return true
		}
	}
	return isSequentialPassword(chars)
}

// isSequentialPassword 识别可循环的升序和降序数字、英文字母序列。
func isSequentialPassword(chars []rune) bool {
	for _, alphabet := range []string{"0123456789", "abcdefghijklmnopqrstuvwxyz"} {
		letters := []rune(alphabet)
		for _, direction := range []int{1, -1} {
			start := strings.IndexRune(alphabet, chars[0])
			if start < 0 {
				continue
			}
			matches := true
			for index, char := range chars {
				position := (start + direction*index) % len(letters)
				if position < 0 {
					position += len(letters)
				}
				if char != letters[position] {
					matches = false
					break
				}
			}
			if matches {
				return true
			}
		}
	}
	return false
}

// Login 对不存在的账号和错误密码返回相同提示，避免暴露账号是否存在。
func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	token, err := utils.GenerateToken(user.ID, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成令牌失败: " + err.Error()})
		return
	}

	// 异步记录登录信息（不阻塞登录流程）
	go recordLogin(user.ID, c.ClientIP())

	c.JSON(http.StatusOK, gin.H{"token": token, "username": user.Username, "role": user.Role})
}

// recordLogin 异步记录用户登录信息
// 1. 获取客户端 IP
// 2. 调用 ip-api.com 查询城市
// 3. 写入 LoginRecord 表
func recordLogin(userID uint, ip string) {
	city := queryIPCity(ip)
	record := models.LoginRecord{
		UserID: userID,
		IP:     ip,
		City:   city,
	}
	database.DB.Create(&record)

	// 异常登录检测逻辑 (最近 3 天内超过 2 个不重复城市)
	checkAbnormalLogin(userID)
}

// checkAbnormalLogin 检查用户的登录城市是否异常
func checkAbnormalLogin(userID uint) {
	// 获取最近 3 天的时间范围
	threeDaysAgo := time.Now().AddDate(0, 0, -3)

	var cities []string
	// 查询该用户最近 3 天不重复的有效城市（排除本地和未知）
	err := database.DB.Model(&models.LoginRecord{}).
		Where("user_id = ? AND created_at >= ? AND city != '本地' AND city != '未知'", userID, threeDaysAgo).
		Distinct("city").
		Pluck("city", &cities).Error

	if err != nil {
		fmt.Printf("Failed to check abnormal login for user %d: %v\n", userID, err)
		return
	}

	// 如果超过 2 个不同的城市，触发封禁
	if len(cities) > 2 {
		reason := fmt.Sprintf("系统自动封禁：最近3天内在%d个不同城市登录 (%+v)", len(cities), cities)
		database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
			"status": 1,
			"remark": reason,
		})
		fmt.Printf("User %d automatically banned due to abnormal login locations: %v\n", userID, cities)
	}
}

// queryIPCity 通过 ip-api.com 免费接口查询 IP 对应城市
// 查询失败返回 "未知"
func queryIPCity(ip string) string {
	// 本地 IP 直接返回
	if ip == "127.0.0.1" || ip == "::1" || ip == "" {
		return "本地"
	}

	resp, err := http.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=status,city,regionName,country&lang=zh-CN", ip))
	if err != nil {
		return "未知"
	}
	defer resp.Body.Close()

	var result struct {
		Status     string `json:"status"`
		City       string `json:"city"`
		RegionName string `json:"regionName"`
		Country    string `json:"country"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || result.Status != "success" {
		return "未知"
	}

	// 拼接：国家-省份-城市
	if result.Country != "" && result.RegionName != "" && result.City != "" {
		return fmt.Sprintf("%s %s %s", result.Country, result.RegionName, result.City)
	}
	return "未知"
}

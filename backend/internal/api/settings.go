package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"website_test/internal/database"
	"website_test/internal/models"

	"github.com/gin-gonic/gin"
)

// GetManual 获取系统使用手册内容
func GetManual(c *gin.Context) {
	// 假设可执行文件或工作目录位于 website_test 下，根据实际情况调整路径
	manualPath := filepath.Join("..", "USER_MANUAL.md")
	// 因为是在 backend 下运行，所以上级目录是 website_test
	content, err := os.ReadFile(manualPath)
	if err != nil {
		// Fallback for cases where it's run from project root
		manualPath = "USER_MANUAL.md"
		content, err = os.ReadFile(manualPath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "无法读取用户手册"})
			return
		}
	}

	c.Data(http.StatusOK, "text/markdown; charset=utf-8", content)
}

// GetSettings 获取公开系统配置
// 任何人都可以访问
func GetSettings(c *gin.Context) {
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key is required"})
		return
	}

	var setting models.SystemSetting
	if err := database.DB.Where("`key` = ?", key).First(&setting).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "setting not found"})
		return
	}

	// 尝试解析 JSON
	var value interface{}
	if err := json.Unmarshal([]byte(setting.Value), &value); err == nil {
		c.JSON(http.StatusOK, value)
	} else {
		c.JSON(http.StatusOK, gin.H{"value": setting.Value})
	}
}

// UpdateSettingReq 更新配置请求
type UpdateSettingReq struct {
	Key   string      `json:"key" binding:"required"`
	Value interface{} `json:"value" binding:"required"` // 可以是对象或字符串
}

// UpdateSettings 更新系统配置 (Admin)
func UpdateSettings(c *gin.Context) {
	var req UpdateSettingReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 将 Value 序列化为 JSON 字符串存储
	bytes, err := json.Marshal(req.Value)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to serialize value"})
		return
	}

	setting := models.SystemSetting{
		Key:   req.Key,
		Value: string(bytes),
	}

	// 使用 Save 进行 Upsert (MySQL 如果 key 唯一索引存在则更新，否则插入)
	// GORM 的 Clauses.OnConflict 需要明确指定
	// 这里简单点：查找是否存在，存在则更新，不存在则创建
	var existing models.SystemSetting
	if err := database.DB.Where("`key` = ?", req.Key).First(&existing).Error; err == nil {
		existing.Value = string(bytes)
		database.DB.Save(&existing)
	} else {
		database.DB.Create(&setting)
	}

	c.JSON(http.StatusOK, gin.H{"message": "settings updated"})
}

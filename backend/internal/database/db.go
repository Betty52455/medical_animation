package database

import (
	"log"
	"website_test/internal/config"
	"website_test/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// DB 全局数据库实例
var DB *gorm.DB

// InitDB 初始化数据库连接并自动迁移表结构
func InitDB() {
	var err error
	dbPath := config.GlobalConfig.DatabasePath
	if dbPath == "" {
		dbPath = "kpsucai.db" // 兜底默认值
	}
	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatal("数据库连接失败: ", err)
	}

	// 自动迁移模式
	err = DB.AutoMigrate(&models.User{}, &models.Category{}, &models.Material{}, &models.RedeemCode{}, &models.DownloadRecord{}, &models.LoginRecord{}, &models.SystemSetting{})
	if err != nil {
		log.Fatalf("Fail to auto migrate: %v", err)
	}

	// 初始化默认管理员账号
	seedAdmin()
}

// seedAdmin 创建默认管理员账号（如果不存在）
func seedAdmin() {
	adminCfg := config.GlobalConfig.Admin

	var count int64
	DB.Model(&models.User{}).Where("username = ?", adminCfg.Username).Count(&count)
	if count > 0 {
		log.Printf("管理员账号 '%s' 已存在，跳过创建", adminCfg.Username)
		return
	}

	// 对密码进行哈希处理
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(adminCfg.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal("管理员密码哈希失败: ", err)
	}

	admin := models.User{
		Username:     adminCfg.Username,
		PasswordHash: string(hashedPassword),
		Role:         "admin",
	}

	if err := DB.Create(&admin).Error; err != nil {
		log.Fatal("创建管理员账号失败: ", err)
	}

	log.Printf("默认管理员账号创建成功: username=%s", adminCfg.Username)
}

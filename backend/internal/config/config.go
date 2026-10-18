package config

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

// AdminConfig 管理员默认账号配置
type AdminConfig struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// AppConfig 应用程序配置
type AppConfig struct {
	Admin        AdminConfig `json:"admin"`
	DatabasePath string      `json:"database_path"`
	UploadDir    string      `json:"upload_dir"`
	JWTSecret    string      `json:"jwt_secret"`
	ServerPort   string      `json:"server_port"`
}

// GlobalConfig 全局配置实例
var GlobalConfig AppConfig

// LoadConfig 从 config.json 加载配置
func LoadConfig(path string) {
	file, err := os.Open(path)
	if err != nil {
		log.Fatalf("无法打开配置文件: %v", err)
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&GlobalConfig); err != nil {
		log.Fatalf("解析配置文件失败: %v", err)
	}
	if GlobalConfig.JWTSecret == "" {
		log.Fatal("配置错误: jwt_secret 不能为空")
	}
	// 兼容既有生产配置；本地初始化脚本会指定独立的数据目录。
	if GlobalConfig.UploadDir == "" {
		GlobalConfig.UploadDir = "/opt/data/uploads"
	}
	uploadDir, err := filepath.Abs(GlobalConfig.UploadDir)
	if err != nil || uploadDir == string(filepath.Separator) {
		log.Fatal("配置错误: upload_dir 必须是有效的专用素材目录")
	}
	GlobalConfig.UploadDir = uploadDir

	log.Printf("配置加载成功: admin=%s, port=%s", GlobalConfig.Admin.Username, GlobalConfig.ServerPort)
}

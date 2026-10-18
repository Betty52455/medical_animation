package main

import (
	"path/filepath"
	"website_test/internal/api"
	"website_test/internal/config"
	"website_test/internal/database"
	"website_test/internal/services"

	"github.com/gin-gonic/gin"
)

// main 加载环境配置并启动数据库、素材存储和 HTTP 路由。
func main() {
	// 1. 加载配置文件
	config.LoadConfig("config.json")

	// 2. 初始化数据库（包括自动创建默认管理员）
	database.InitDB()

	// 3. 初始化文件存储目录
	services.InitStorage()

	r := gin.Default()

	// CORS 中间件（开发环境简易版本）
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 只暴露预览图目录（带水印），原始文件不直接暴露
	r.Static("/uploads/previews", filepath.Join(config.GlobalConfig.UploadDir, "previews"))
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})
	r.GET("/api/categories", api.GetCategories)
	r.GET("/api/materials", api.GetMaterials)
	r.GET("/api/public/settings", api.GetSettings)             // 公开获取配置接口
	r.GET("/api/materials/:id/stream", api.StreamMaterial)     // 视频/音频在线播放（不扣积分）
	r.GET("/api/materials/:id/download", api.DownloadMaterial) // 下载原文件（支持 token 查询参数）

	// 用户认证路由
	auth := r.Group("/api/auth")
	{
		auth.POST("/register", api.Register)
		auth.POST("/login", api.Login)
	}

	// ==================== 需要登录的路由 ====================
	protected := r.Group("/api")
	protected.Use(api.AuthMiddleware())
	{
		protected.POST("/redeem", api.RedeemCodeHandler)                  // 用户兑换积分码
		protected.GET("/my-points", api.GetMyPoints)                      // 查询积分余额
		protected.GET("/my-redeem-history", api.GetMyRedeemHistory)       // 查询兑换记录
		protected.GET("/my-download-history", api.GetMyDownloadHistory)   // 查询下载记录
		protected.GET("/materials/:id/download/check", api.CheckDownload) // 新增前置检查
	}

	// ==================== 管理员路由 ====================
	admin := r.Group("/api/admin")
	admin.Use(api.AuthMiddleware(), api.AdminMiddleware())
	{
		admin.GET("/manual", api.GetManual) // 加入使用手册接口
		admin.POST("/upload", api.UploadMaterial)
		admin.POST("/categories", api.CreateCategory)
		admin.POST("/redeem-codes/generate", api.GenerateRedeemCodes)        // 生成兑换码
		admin.GET("/redeem-codes", api.GetRedeemCodes)                       // 查询兑换码列表
		admin.GET("/users", api.GetUsers)                                    // 查询所有用户
		admin.PUT("/users/:id/points", api.UpdateUserPoints)                 // 修改用户积分
		admin.PUT("/users/:id/remark", api.UpdateUserRemark)                 // 修改用户备注
		admin.PUT("/users/:id/status", api.UpdateUserStatus)                 // 修改用户状态（封禁/解封）
		admin.GET("/users/:id/redeem-history", api.GetUserRedeemHistory)     // 用户兑换历史
		admin.GET("/users/:id/download-history", api.GetUserDownloadHistory) // 用户下载历史
		admin.POST("/settings", api.UpdateSettings)                          // 更新系统配置
		admin.PUT("/redeem-codes/:id/remark", api.UpdateRedeemCodeRemark)    // 更新兑换码备注
		admin.GET("/materials", api.AdminGetMaterials)                       // 管理端素材列表
		admin.PUT("/materials/:id", api.UpdateMaterial)                      // 编辑素材（标题/积分）
		admin.PUT("/materials/:id/categories", api.UpdateMaterialCategories) // 修改素材分组
		admin.DELETE("/materials/:id", api.DeleteMaterial)                   // 软删除素材
		admin.DELETE("/system/clear-materials", api.ClearAllMaterials)       // 一键清空素材库

		// ============ 运营统计 ============
		admin.GET("/stats/overview", api.GetStatsOverview)              // 概览数字
		admin.GET("/stats/user-trend", api.GetUserTrend)                // 用户趋势
		admin.GET("/stats/material-trend", api.GetMaterialTrend)        // 素材趋势
		admin.GET("/stats/material-type-dist", api.GetMaterialTypeDist) // 素材类型分布
		admin.GET("/stats/points-trend", api.GetPointsTrend)            // 积分趋势
		admin.GET("/stats/login-records", api.GetLoginRecords)          // 登录记录
		admin.GET("/users/:id/login-history", api.GetUserLoginHistory)  // 用户登录历史
	}

	r.Run(config.GlobalConfig.ServerPort)
}

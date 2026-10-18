package api

import (
	"net/http"
	"strconv"
	"time"
	"website_test/internal/database"
	"website_test/internal/models"

	"github.com/gin-gonic/gin"
)

// ==================== 辅助函数 ====================

// getStartDate 根据 days 参数计算起始日期
// days=7 表示近 7 天，days=14 近 2 周，days=30 近 1 月，days=0 表示全部
func getStartDate(c *gin.Context) *time.Time {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days <= 0 {
		return nil // 全部数据，不限时间
	}
	t := time.Now().AddDate(0, 0, -days)
	// 截断到当天零点
	start := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
	return &start
}

// ==================== 概览统计 ====================

// GetStatsOverview 获取概览数字
// GET /api/admin/stats/overview
func GetStatsOverview(c *gin.Context) {
	// 1. 总用户数
	var totalUsers int64
	database.DB.Model(&models.User{}).Count(&totalUsers)

	// 2. 今日新增用户
	today := time.Now().Format("2006-01-02")
	var todayNewUsers int64
	database.DB.Model(&models.User{}).Where("DATE(created_at) = ?", today).Count(&todayNewUsers)

	// 3. 素材总量
	var totalMaterials int64
	database.DB.Model(&models.Material{}).Count(&totalMaterials)

	// 4. 积分池余额（所有用户当前积分总和）
	var totalPoints int
	database.DB.Model(&models.User{}).Select("COALESCE(SUM(points), 0)").Scan(&totalPoints)

	// 5. 今日下载次数
	var todayDownloads int64
	database.DB.Model(&models.DownloadRecord{}).Where("DATE(created_at) = ?", today).Count(&todayDownloads)

	// 6. 今日活跃用户（今日登录过的不同用户数）
	var todayActiveUsers int64
	database.DB.Model(&models.LoginRecord{}).Where("DATE(created_at) = ?", today).
		Distinct("user_id").Count(&todayActiveUsers)

	c.JSON(http.StatusOK, gin.H{
		"total_users":        totalUsers,
		"today_new_users":    todayNewUsers,
		"total_materials":    totalMaterials,
		"total_points":       totalPoints,
		"today_downloads":    todayDownloads,
		"today_active_users": todayActiveUsers,
	})
}

// ==================== 用户趋势 ====================

// dailyStat 每日统计数据通用结构
type dailyStat struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// GetUserTrend 获取用户趋势数据
// GET /api/admin/stats/user-trend?days=7
// 返回每日登录用户数和每日下载用户数
func GetUserTrend(c *gin.Context) {
	startDate := getStartDate(c)

	// 1. 每日登录用户数（去重）
	var loginTrend []dailyStat
	loginQuery := database.DB.Model(&models.LoginRecord{}).
		Select("DATE(created_at) as date, COUNT(DISTINCT user_id) as count").
		Group("DATE(created_at)").
		Order("date ASC")
	if startDate != nil {
		loginQuery = loginQuery.Where("created_at >= ?", startDate)
	}
	loginQuery.Scan(&loginTrend)

	// 2. 每日下载用户数（去重）
	var downloadUserTrend []dailyStat
	dlQuery := database.DB.Model(&models.DownloadRecord{}).
		Select("DATE(created_at) as date, COUNT(DISTINCT user_id) as count").
		Group("DATE(created_at)").
		Order("date ASC")
	if startDate != nil {
		dlQuery = dlQuery.Where("created_at >= ?", startDate)
	}
	dlQuery.Scan(&downloadUserTrend)

	// 3. 每日新增用户数
	var newUserTrend []dailyStat
	newQuery := database.DB.Model(&models.User{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Group("DATE(created_at)").
		Order("date ASC")
	if startDate != nil {
		newQuery = newQuery.Where("created_at >= ?", startDate)
	}
	newQuery.Scan(&newUserTrend)

	c.JSON(http.StatusOK, gin.H{
		"login_trend":         loginTrend,
		"download_user_trend": downloadUserTrend,
		"new_user_trend":      newUserTrend,
	})
}

// ==================== 素材趋势 ====================

// materialRank 热门素材排行数据结构
type materialRank struct {
	MaterialID    uint   `json:"material_id"`
	MaterialTitle string `json:"material_title"`
	MaterialType  int    `json:"material_type"`
	DownloadCount int    `json:"download_count"`
	PointsCost    int    `json:"points_cost"`
}

// GetMaterialTrend 获取素材下载趋势和热门排行
// GET /api/admin/stats/material-trend?days=7
func GetMaterialTrend(c *gin.Context) {
	startDate := getStartDate(c)

	// 1. 每日下载次数
	var downloadTrend []dailyStat
	dlQuery := database.DB.Model(&models.DownloadRecord{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Group("DATE(created_at)").
		Order("date ASC")
	if startDate != nil {
		dlQuery = dlQuery.Where("created_at >= ?", startDate)
	}
	dlQuery.Scan(&downloadTrend)

	// 2. 热门素材 TOP 10
	var topMaterials []materialRank
	topQuery := database.DB.Raw(`
		SELECT d.material_id, COALESCE(m.title, '已删除素材') AS material_title,
		       COALESCE(m.type, 0) AS material_type, COALESCE(m.points_cost, 0) AS points_cost,
		       COUNT(*) AS download_count
		FROM download_records d
		LEFT JOIN materials m ON d.material_id = m.id
		WHERE 1=1
	`)
	if startDate != nil {
		topQuery = database.DB.Raw(`
			SELECT d.material_id, COALESCE(m.title, '已删除素材') AS material_title,
			       COALESCE(m.type, 0) AS material_type, COALESCE(m.points_cost, 0) AS points_cost,
			       COUNT(*) AS download_count
			FROM download_records d
			LEFT JOIN materials m ON d.material_id = m.id
			WHERE d.created_at >= ?
			GROUP BY d.material_id
			ORDER BY download_count DESC
			LIMIT 10
		`, startDate)
	} else {
		topQuery = database.DB.Raw(`
			SELECT d.material_id, COALESCE(m.title, '已删除素材') AS material_title,
			       COALESCE(m.type, 0) AS material_type, COALESCE(m.points_cost, 0) AS points_cost,
			       COUNT(*) AS download_count
			FROM download_records d
			LEFT JOIN materials m ON d.material_id = m.id
			GROUP BY d.material_id
			ORDER BY download_count DESC
			LIMIT 10
		`)
	}
	topQuery.Scan(&topMaterials)

	c.JSON(http.StatusOK, gin.H{
		"download_trend": downloadTrend,
		"top_materials":  topMaterials,
	})
}

// ==================== 素材类型分布 ====================

// typeDist 素材类型分布数据结构
type typeDist struct {
	Type  int `json:"type"`
	Count int `json:"count"`
}

// GetMaterialTypeDist 获取素材类型分布
// GET /api/admin/stats/material-type-dist
func GetMaterialTypeDist(c *gin.Context) {
	var dist []typeDist
	database.DB.Model(&models.Material{}).
		Select("type, COUNT(*) as count").
		Group("type").
		Scan(&dist)

	c.JSON(http.StatusOK, gin.H{"data": dist})
}

// ==================== 积分趋势 ====================

// GetPointsTrend 获取积分充值/消耗趋势
// GET /api/admin/stats/points-trend?days=7
func GetPointsTrend(c *gin.Context) {
	startDate := getStartDate(c)

	// 1. 每日积分充值（已使用的兑换码，且积分 > 0）
	var rechargeTrend []dailyStat
	rechargeQuery := database.DB.Model(&models.RedeemCode{}).
		Select("DATE(used_at) as date, COALESCE(SUM(points), 0) as count").
		Where("is_used = ? AND points > 0", true).
		Group("DATE(used_at)").
		Order("date ASC")
	if startDate != nil {
		rechargeQuery = rechargeQuery.Where("used_at >= ?", startDate)
	}
	rechargeQuery.Scan(&rechargeTrend)

	// 2. 每日积分消耗（下载扣除）
	var consumeTrend []dailyStat
	consumeQuery := database.DB.Model(&models.DownloadRecord{}).
		Select("DATE(created_at) as date, COALESCE(SUM(points_cost), 0) as count").
		Where("points_cost > 0").
		Group("DATE(created_at)").
		Order("date ASC")
	if startDate != nil {
		consumeQuery = consumeQuery.Where("created_at >= ?", startDate)
	}
	consumeQuery.Scan(&consumeTrend)

	c.JSON(http.StatusOK, gin.H{
		"recharge_trend": rechargeTrend,
		"consume_trend":  consumeTrend,
	})
}

// ==================== 登录记录 ====================

// loginRecordItem 登录记录响应结构
type loginRecordItem struct {
	ID        uint   `json:"id"`
	UserID    uint   `json:"user_id"`
	Username  string `json:"username"`
	IP        string `json:"ip"`
	City      string `json:"city"`
	CreatedAt string `json:"created_at"`
}

// GetLoginRecords 获取最近的登录记录
// GET /api/admin/stats/login-records?days=7
func GetLoginRecords(c *gin.Context) {
	startDate := getStartDate(c)

	var records []loginRecordItem
	query := database.DB.Raw(`
		SELECT l.id, l.user_id, u.username, l.ip, l.city, l.created_at
		FROM login_records l
		LEFT JOIN users u ON l.user_id = u.id
		WHERE 1=1
	`)
	if startDate != nil {
		query = database.DB.Raw(`
			SELECT l.id, l.user_id, u.username, l.ip, l.city, l.created_at
			FROM login_records l
			LEFT JOIN users u ON l.user_id = u.id
			WHERE l.created_at >= ?
			ORDER BY l.created_at DESC
			LIMIT 200
		`, startDate)
	} else {
		query = database.DB.Raw(`
			SELECT l.id, l.user_id, u.username, l.ip, l.city, l.created_at
			FROM login_records l
			LEFT JOIN users u ON l.user_id = u.id
			ORDER BY l.created_at DESC
			LIMIT 200
		`)
	}
	query.Scan(&records)

	c.JSON(http.StatusOK, gin.H{"data": records})
}

// ==================== 用户登录历史 ====================

// GetUserLoginHistory 获取指定用户的登录记录
// GET /api/admin/users/:id/login-history
func GetUserLoginHistory(c *gin.Context) {
	userID := c.Param("id")

	var records []models.LoginRecord
	database.DB.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(100).
		Find(&records)

	c.JSON(http.StatusOK, gin.H{"data": records})
}

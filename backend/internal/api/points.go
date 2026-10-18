package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"
	"website_test/internal/database"
	"website_test/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ==================== 请求/响应结构体 ====================

// GenerateCodesRequest 生成兑换码的请求参数
type GenerateCodesRequest struct {
	Count  int `json:"count" binding:"required,min=1,max=1000"` // 生成数量（1-1000）
	Points int `json:"points" binding:"required,min=1"`         // 每个兑换码面值
}

// RedeemRequest 用户兑换积分码的请求参数
type RedeemRequest struct {
	Code string `json:"code" binding:"required"` // 兑换码字符串
}

// UpdatePointsRequest 管理员修改用户积分的请求参数
type UpdatePointsRequest struct {
	Points int `json:"points"` // 新的积分值（允许为 0）
}

// ==================== 管理员接口 ====================

// GenerateRedeemCodes 批量生成积分兑换码
// POST /api/admin/redeem-codes/generate
// 参数：count（数量）、points（面值）
// 返回：生成的兑换码列表和批次 ID
func GenerateRedeemCodes(c *gin.Context) {
	var req GenerateCodesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误：需要 count(1-1000) 和 points(>0)"})
		return
	}

	// 1. 生成唯一批次 ID，方便按批次管理
	batchID := uuid.New().String()

	// 2. 批量生成兑换码
	codes := make([]models.RedeemCode, 0, req.Count)
	codeStrings := make([]string, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		code := generateRandomCode()
		codes = append(codes, models.RedeemCode{
			Code:    code,
			Points:  req.Points,
			BatchID: batchID,
		})
		codeStrings = append(codeStrings, code)
	}

	// 3. 批量写入数据库
	if err := database.DB.Create(&codes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成兑换码失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "兑换码生成成功",
		"batch_id": batchID,
		"count":    req.Count,
		"points":   req.Points,
		"codes":    codeStrings,
	})
}

// GetRedeemCodes 查询兑换码列表
// GET /api/admin/redeem-codes?page=1&page_size=20&batch_id=xxx&status=used/unused&q=搜索关键词
func GetRedeemCodes(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	batchID := c.Query("batch_id")
	status := c.Query("status") // "used" / "unused" / 空=全部
	searchQuery := c.Query("q") // 搜索关键词（匹配 code 或 remark）

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	db := database.DB.Model(&models.RedeemCode{})

	// 按批次筛选
	if batchID != "" {
		db = db.Where("batch_id = ?", batchID)
	}
	// 按使用状态筛选
	if status == "used" {
		db = db.Where("is_used = ?", true)
	} else if status == "unused" {
		db = db.Where("is_used = ?", false)
	}
	// 按关键词搜索（兑换码或备注）
	if searchQuery != "" {
		like := "%" + searchQuery + "%"
		db = db.Where("code LIKE ? OR remark LIKE ?", like, like)
	}

	var total int64
	db.Count(&total)

	var codes []models.RedeemCode
	if err := db.Order("created_at desc").Offset(offset).Limit(pageSize).
		Preload("UsedByUser").Find(&codes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询兑换码失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":      codes,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// UpdateRedeemCodeRemark 更新兑换码备注
// PUT /api/admin/redeem-codes/:id/remark
func UpdateRedeemCodeRemark(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ID"})
		return
	}

	var req struct {
		Remark string `json:"remark"` // 备注内容
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// 更新备注字段
	result := database.DB.Model(&models.RedeemCode{}).Where("id = ?", id).Update("remark", req.Remark)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新备注失败: " + result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "兑换码不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "备注更新成功"})
}

// GetUsers 查询所有用户及积分
// GET /api/admin/users?page=1&page_size=20
func GetUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var total int64
	database.DB.Model(&models.User{}).Count(&total)

	var users []models.User
	if err := database.DB.Order("created_at desc").Offset(offset).Limit(pageSize).Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询用户失败: " + err.Error()})
		return
	}

	// 构建包含历史充值总积分的响应数据
	type UserWithStats struct {
		models.User
		TotalRedeemedPoints int `json:"total_redeemed_points"` // 历史充值总积分
	}

	var result []UserWithStats
	for _, u := range users {
		// 查询该用户的历史充值总积分（已使用的兑换码积分总和）
		var totalRedeemed int
		database.DB.Model(&models.RedeemCode{}).
			Where("used_by = ?", u.ID).
			Select("COALESCE(SUM(points), 0)").
			Scan(&totalRedeemed)

		result = append(result, UserWithStats{
			User:                u,
			TotalRedeemedPoints: totalRedeemed,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"data":      result,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// UpdateUserRemark 更新用户备注
// PUT /api/admin/users/:id/remark
func UpdateUserRemark(c *gin.Context) {
	userID := c.Param("id")

	var req struct {
		Remark string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).
		Update("remark", req.Remark).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新备注失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "备注更新成功"})
}

// UpdateUserStatus 管理员手动封禁/解封用户
// PUT /api/admin/users/:id/status
func UpdateUserStatus(c *gin.Context) {
	userID := c.Param("id")

	var req struct {
		Status int     `json:"status"` // 0=正常，1=封禁
		Remark *string `json:"remark"` // 可选备注
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if req.Status != 0 && req.Status != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 status 值（支持 0 或 1）"})
		return
	}

	updates := map[string]interface{}{
		"status": req.Status,
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	} else if req.Status == 0 {
		// 如果解封且未传新备注，清空由系统自动生成的封禁备注
		updates["remark"] = ""
	}

	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新状态失败: " + err.Error()})
		return
	}

	msg := "用户状态更新成功"
	if req.Status == 1 {
		msg = "用户已被封禁"
	} else {
		msg = "用户已解封"
	}

	c.JSON(http.StatusOK, gin.H{"message": msg})
}

// UpdateUserPoints 管理员手动修改用户积分
// PUT /api/admin/users/:id/points
func UpdateUserPoints(c *gin.Context) {
	userID := c.Param("id")

	var req UpdatePointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// 不允许设置负数积分
	if req.Points < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "积分不能为负数"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	// 计算积分变化量
	diff := req.Points - user.Points

	user.Points = req.Points
	if err := database.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "修改积分失败: " + err.Error()})
		return
	}

	// 积分变化时，创建一条兑换记录（管理员手动调整）
	if diff != 0 {
		now := time.Now()
		remark := "管理员手动增加积分"
		if diff < 0 {
			remark = "管理员手动扣除积分"
		}
		record := models.RedeemCode{
			Code:    "ADMIN-" + uuid.New().String()[:8], // 唯一码，以 ADMIN- 开头便于区分
			Points:  diff,                               // 变化量（正数=增加，负数=扣除）
			BatchID: "admin-manual",                     // 标记为管理员手动操作
			Remark:  remark,
			IsUsed:  true,
			UsedBy:  &user.ID,
			UsedAt:  &now,
		}
		database.DB.Create(&record)
	}

	c.JSON(http.StatusOK, gin.H{"message": "积分修改成功", "points": user.Points})
}

// GetUserRedeemHistory 查看某用户的兑换历史
// GET /api/admin/users/:id/redeem-history
func GetUserRedeemHistory(c *gin.Context) {
	userID := c.Param("id")

	var records []models.RedeemCode
	if err := database.DB.Where("used_by = ?", userID).
		Order("used_at desc").Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询兑换历史失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": records})
}

// GetMyRedeemHistory 当前用户查看自己的兑换记录
// GET /api/my-redeem-history
func GetMyRedeemHistory(c *gin.Context) {
	// 从 JWT 中间件获取当前用户 ID
	userID, _ := c.Get("user_id")
	uid := userID.(uint)

	var records []models.RedeemCode
	if err := database.DB.Where("used_by = ?", uid).
		Order("used_at desc").Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询兑换记录失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": records})
}

// ==================== 用户接口 ====================

// RedeemCode 用户兑换积分码
// POST /api/redeem
// 需要登录，从 JWT 中获取 user_id
func RedeemCodeHandler(c *gin.Context) {
	var req RedeemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入兑换码"})
		return
	}

	// 1. 从 JWT 中间件获取当前用户 ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	uid := userID.(uint)

	// 检查用户是否被封禁
	var currentUser models.User
	if err := database.DB.Select("status").First(&currentUser, uid).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户不存在"})
		return
	}
	if currentUser.Status == 1 {
		c.JSON(http.StatusForbidden, gin.H{"error": "账号存在异常记录，已限制下载和充值，请联系管理员"})
		return
	}
	var redeemCode models.RedeemCode
	if err := database.DB.Where("code = ?", req.Code).First(&redeemCode).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "兑换码无效"})
		return
	}

	// 3. 检查是否已使用
	if redeemCode.IsUsed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "兑换码已被使用"})
		return
	}

	// 4. 使用事务：标记兑换码已使用 + 给用户加积分
	tx := database.DB.Begin()
	now := time.Now()

	// 4.1 标记兑换码已使用
	redeemCode.IsUsed = true
	redeemCode.UsedBy = &uid
	redeemCode.UsedAt = &now
	if err := tx.Save(&redeemCode).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "兑换失败: " + err.Error()})
		return
	}

	// 4.2 给用户增加积分
	if err := tx.Model(&models.User{}).Where("id = ?", uid).
		Update("points", database.DB.Raw("points + ?", redeemCode.Points)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "积分到账失败: " + err.Error()})
		return
	}

	tx.Commit()

	// 5. 查询用户最新积分余额
	var user models.User
	database.DB.First(&user, uid)

	c.JSON(http.StatusOK, gin.H{
		"message": "兑换成功",
		"points":  redeemCode.Points,
		"balance": user.Points,
	})
}

// GetMyPoints 获取当前用户积分余额
// GET /api/my-points
func GetMyPoints(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID.(uint)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"points": user.Points})
}

// ==================== 辅助函数 ====================

// generateRandomCode 生成 16 字符的随机兑换码（大写字母+数字）
func generateRandomCode() string {
	bytes := make([]byte, 8) // 8 bytes → 16 hex chars
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

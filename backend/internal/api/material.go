package api

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"website_test/internal/config"
	"website_test/internal/database"
	"website_test/internal/models"
	"website_test/internal/services"
	"website_test/internal/utils"

	"github.com/gin-gonic/gin"
)

// UploadMaterial 处理多文件上传并分配分类
// 支持设置每个素材的下载积分（points_cost 参数）
func UploadMaterial(c *gin.Context) {
	// Multipart form
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "表单数据无效"})
		return
	}

	files := form.File["files"]
	categoryIDsStr := c.PostFormArray("category_ids")

	// 解析素材积分（每个素材的下载成本，默认 0 = 免费）
	pointsCost, _ := strconv.Atoi(c.PostForm("points_cost"))
	if pointsCost < 0 {
		pointsCost = 0
	}

	// 解析分类 ID
	var categories []models.Category
	for _, idStr := range categoryIDsStr {
		id, _ := strconv.Atoi(idStr)
		if id > 0 {
			categories = append(categories, models.Category{ID: uint(id)})
		}
	}

	for _, file := range files {
		filename := filepath.Base(file.Filename)
		// 给文件名添加时间戳前缀，避免同名文件覆盖
		uniqueFilename := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filename)
		originalPath := filepath.Join(config.GlobalConfig.UploadDir, "originals", uniqueFilename)

		if err := c.SaveUploadedFile(file, originalPath); err != nil {
			continue
		}

		// 素材类型常量：0=其他, 1=图片, 2=视频, 3=音频
		matType := 0 // 默认为其他类型
		ext := strings.ToLower(filepath.Ext(file.Filename))

		// 按后缀名判断素材类型
		imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".bmp": true, ".webp": true, ".svg": true}
		videoExts := map[string]bool{".mp4": true, ".mov": true, ".avi": true, ".mkv": true, ".wmv": true, ".flv": true}
		audioExts := map[string]bool{".mp3": true, ".wav": true, ".flac": true, ".aac": true, ".ogg": true, ".wma": true, ".m4a": true}

		if imageExts[ext] {
			matType = 1
		} else if videoExts[ext] {
			matType = 2
		} else if audioExts[ext] {
			matType = 3
		}

		// 异步处理：图片和视频生成预览图，其他类型直接入库
		go func(fPath string, mType int, title string, cats []models.Category, cost int) {
			var previewPath string

			// 仅图片和视频需要 ffmpeg 生成预览图
			if mType == 1 || mType == 2 {
				var err error
				previewPath, err = services.ProcessMaterial(fPath, mType)
				if err != nil {
					// 预览图生成失败仍然入库，只是没有预览图
					previewPath = ""
				} else {
					// 公开 URL 不依赖各环境的物理目录，也不泄漏绝对路径。
					previewPath = "uploads/previews/" + filepath.Base(previewPath)
				}
			}

			material := models.Material{
				Title:       title,
				Type:        mType,
				PointsCost:  cost,
				OriginalURL: fPath,
				PreviewURL:  previewPath,
				Categories:  cats,
			}
			database.DB.Create(&material)
		}(originalPath, matType, file.Filename, categories, pointsCost)
	}

	c.JSON(http.StatusOK, gin.H{"message": "上传已开始"})
}

func GetMaterials(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	categoryID, _ := strconv.Atoi(c.Query("category_id"))
	query := c.Query("q")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	var materials []models.Material
	var total int64

	db := database.DB.Model(&models.Material{})

	if categoryID > 0 {
		db = db.Joins("JOIN material_categories ON material_categories.material_id = materials.id").
			Where("material_categories.category_id = ?", categoryID)
	}

	if query != "" {
		db = db.Where("title LIKE ?", "%"+query+"%")
	}

	db.Count(&total)

	// Ordering by newest first
	if err := db.Order("created_at desc").Offset(offset).Limit(pageSize).Preload("Categories").Find(&materials).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch materials: " + err.Error()})
		return
	}

	// 公开接口隐藏 original_url，防止用户从开发者工具看到原始文件路径
	type safeMaterial struct {
		ID         uint              `json:"id"`
		Title      string            `json:"title"`
		Type       int               `json:"type"`
		PointsCost int               `json:"points_cost"`
		PreviewURL string            `json:"preview_url"`
		Categories []models.Category `json:"categories"`
		CreatedAt  time.Time         `json:"created_at"`
	}

	var safeList []safeMaterial
	for _, m := range materials {
		safeList = append(safeList, safeMaterial{
			ID:         m.ID,
			Title:      m.Title,
			Type:       m.Type,
			PointsCost: m.PointsCost,
			PreviewURL: m.PreviewURL,
			Categories: m.Categories,
			CreatedAt:  m.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"data":      safeList,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// DownloadMaterial 下载原始素材文件
// 支持两种认证方式：Authorization header 或 ?token=xxx 查询参数
// 流程：
// 1. 免费素材（points_cost=0）→ 直接下载
// 2. 已购买过的素材 → 直接下载（不重复扣费）
// 3. 未购买的付费素材 → 检查积分、扣费、记录后下载
func DownloadMaterial(c *gin.Context) {
	id := c.Param("id")
	var material models.Material
	if err := database.DB.First(&material, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "素材不存在"})
		return
	}

	// 支持两种认证方式：Header 或 Query 参数
	tokenString := ""
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		tokenString = strings.TrimPrefix(authHeader, "Bearer ")
	} else {
		tokenString = c.Query("token")
	}

	if tokenString == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}

	claims, err := utils.ParseToken(tokenString)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "登录已过期，请重新登录"})
		return
	}

	uid := claims.UserID

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

	// 只有付费素材需要检查积分
	if material.PointsCost > 0 {
		// 检查是否已经购买过（重复下载免费）
		// 检查是否已经购买且在 7 天内
		var existingRecord models.DownloadRecord
		hasRecord := database.DB.Where("user_id = ? AND material_id = ?", uid, material.ID).
			Order("created_at desc").
			First(&existingRecord).Error == nil

		isWithin7Days := false
		if hasRecord {
			isWithin7Days = time.Since(existingRecord.CreatedAt) <= 7*24*time.Hour
		}

		if !isWithin7Days {
			// 首次下载或已超期：检查积分并扣费
			var user models.User
			if err := database.DB.First(&user, uid).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
				return
			}

			if user.Points < material.PointsCost {
				c.JSON(http.StatusPaymentRequired, gin.H{
					"error":    "积分不足",
					"required": material.PointsCost,
					"current":  user.Points,
				})
				return
			}

			// 使用事务扣积分 + 记录下载
			tx := database.DB.Begin()
			if err := tx.Model(&models.User{}).Where("id = ?", uid).
				Update("points", database.DB.Raw("points - ?", material.PointsCost)).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "扣费失败: " + err.Error()})
				return
			}
			record := models.DownloadRecord{
				UserID:     uid,
				MaterialID: material.ID,
				PointsCost: material.PointsCost,
			}
			if err := tx.Create(&record).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "记录下载失败: " + err.Error()})
				return
			}
			tx.Commit()
		}
	} else {
		// 免费素材：直接创建下载记录（不扣费，每次下载都记录）
		record := models.DownloadRecord{
			UserID:     uid,
			MaterialID: material.ID,
			PointsCost: 0,
		}
		database.DB.Create(&record)
	}

	// 获取文件名，正确处理中文和特殊字符
	filename := filepath.Base(material.OriginalURL)
	// 使用 RFC 5987 编码方式处理含有中文的文件名
	c.Writer.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename*=UTF-8''%s`, url.PathEscape(filename)))
	c.Writer.Header().Set("Content-Type", "application/octet-stream")
	c.File(material.OriginalURL)
}

// CheckDownload 检查是否允许下载素材（给前端弹窗前置拦截使用）
// GET /api/materials/:id/download/check
func CheckDownload(c *gin.Context) {
	id := c.Param("id")
	var material models.Material
	if err := database.DB.First(&material, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "素材不存在"})
		return
	}

	userId, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	uid := userId.(uint)

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

	// 只有付费素材需要检查积分
	if material.PointsCost > 0 {
		var existingRecord models.DownloadRecord
		hasRecord := database.DB.Where("user_id = ? AND material_id = ?", uid, material.ID).
			Order("created_at desc").
			First(&existingRecord).Error == nil

		isWithin7Days := false
		if hasRecord {
			isWithin7Days = time.Since(existingRecord.CreatedAt) <= 7*24*time.Hour
		}

		if !isWithin7Days {
			var user models.User
			if err := database.DB.First(&user, uid).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
				return
			}
			if user.Points < material.PointsCost {
				c.JSON(http.StatusPaymentRequired, gin.H{
					"error":    "积分不足",
					"required": material.PointsCost,
					"current":  user.Points,
				})
				return
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "allow"})
}

// StreamMaterial 在线播放视频/音频（不扣积分，仅用于预览）
// GET /api/materials/:id/stream
func StreamMaterial(c *gin.Context) {
	id := c.Param("id")
	var material models.Material
	if err := database.DB.First(&material, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "素材不存在"})
		return
	}

	// 只允许视频和音频类型的素材通过此接口播放
	if material.Type != 2 && material.Type != 3 {
		c.JSON(http.StatusForbidden, gin.H{"error": "该素材不支持在线播放"})
		return
	}

	c.File(material.OriginalURL)
}

// ==================== 管理端素材 API ====================

// AdminGetMaterials 管理端获取素材列表（支持搜索和分页）
func AdminGetMaterials(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	query := c.Query("q")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var materials []models.Material
	var total int64

	db := database.DB.Model(&models.Material{})

	// 按标题搜索
	if query != "" {
		db = db.Where("title LIKE ?", "%"+query+"%")
	}

	db.Count(&total)

	// 查询素材列表并预加载分类
	if err := db.Order("created_at desc").Offset(offset).Limit(pageSize).
		Preload("Categories").Find(&materials).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询素材失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":      materials,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// DeleteMaterial 软删除素材
func DeleteMaterial(c *gin.Context) {
	id := c.Param("id")

	var material models.Material
	if err := database.DB.First(&material, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "素材不存在"})
		return
	}

	// GORM 软删除：设置 deleted_at 时间戳，不物理删除
	if err := database.DB.Delete(&material).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "素材已删除"})
}

// UpdateMaterial 编辑素材信息（标题、积分）
// 注意：修改积分不影响已购买用户，因为 DownloadRecord 独立记录了购买时的积分
func UpdateMaterial(c *gin.Context) {
	id := c.Param("id")

	var material models.Material
	if err := database.DB.First(&material, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "素材不存在"})
		return
	}

	var req struct {
		Title      *string `json:"title"`       // 标题（可选）
		PointsCost *int    `json:"points_cost"` // 积分（可选）
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}

	// 按字段更新，避免零值覆盖
	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.PointsCost != nil {
		updates["points_cost"] = *req.PointsCost
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有要更新的字段"})
		return
	}

	if err := database.DB.Model(&material).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "素材更新成功"})
}

// UpdateMaterialCategories 修改素材分组
// 替换素材的全部分类关联
func UpdateMaterialCategories(c *gin.Context) {
	id := c.Param("id")

	var material models.Material
	if err := database.DB.First(&material, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "素材不存在"})
		return
	}

	var req struct {
		CategoryIDs []uint `json:"category_ids"` // 新的分类 ID 数组
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}

	// 1. 构建新的分类切片
	var categories []models.Category
	for _, cid := range req.CategoryIDs {
		categories = append(categories, models.Category{ID: cid})
	}

	// 2. 替换多对多关联（先清除再关联）
	if err := database.DB.Model(&material).Association("Categories").Replace(categories); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新分组失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "分组更新成功"})
}

// downloadHistoryItem 下载记录响应结构体
// 联表查询结果，包含素材标题等额外信息
type downloadHistoryItem struct {
	ID            uint   `json:"id"`
	MaterialID    uint   `json:"material_id"`
	MaterialTitle string `json:"material_title"` // 来自 materials 表的 title
	PointsCost    int    `json:"points_cost"`
	CreatedAt     string `json:"created_at"`
}

// GetMyDownloadHistory 当前用户查看自己的下载记录
// GET /api/my-download-history
func GetMyDownloadHistory(c *gin.Context) {
	// 1. 从 JWT 中间件获取当前用户 ID
	userID, _ := c.Get("user_id")
	uid := userID.(uint)

	// 2. 联表查询下载记录，关联素材标题
	var items []downloadHistoryItem
	database.DB.Raw(`
		SELECT d.id, d.material_id, COALESCE(m.title, '已删除素材') AS material_title,
		       d.points_cost, d.created_at
		FROM download_records d
		LEFT JOIN materials m ON d.material_id = m.id
		WHERE d.user_id = ?
		ORDER BY d.created_at DESC
	`, uid).Scan(&items)

	c.JSON(http.StatusOK, gin.H{"data": items})
}

// GetUserDownloadHistory 管理员查看某用户的下载记录
// GET /api/admin/users/:id/download-history
func GetUserDownloadHistory(c *gin.Context) {
	// 1. 从 URL 参数获取目标用户 ID
	targetUserID := c.Param("id")

	// 2. 联表查询下载记录，关联素材标题
	var items []downloadHistoryItem
	database.DB.Raw(`
		SELECT d.id, d.material_id, COALESCE(m.title, '已删除素材') AS material_title,
		       d.points_cost, d.created_at
		FROM download_records d
		LEFT JOIN materials m ON d.material_id = m.id
		WHERE d.user_id = ?
		ORDER BY d.created_at DESC
	`, targetUserID).Scan(&items)

	c.JSON(http.StatusOK, gin.H{"data": items})
}

// ClearAllMaterials 一键清空素材库及分类 (限时功能：2026年3月31日前可用)
// DELETE /api/admin/system/clear-materials
func ClearAllMaterials(c *gin.Context) {
	// 1. 时间限制判定: 必须在 2026-03-31 23:59:59 之前
	deadline := time.Date(2026, 3, 31, 23, 59, 59, 0, time.Local)
	if time.Now().After(deadline) {
		c.JSON(http.StatusForbidden, gin.H{"error": "该功能已于2026年3月底下线，无法继续使用"})
		return
	}

	// 2. 清理数据库记录：删除三张表的所有数据并重置自增 ID (SQLite使用 DELETE + sqlite_sequence)
	tx := database.DB.Begin()

	// 清空表数据
	if err := tx.Exec("DELETE FROM materials").Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清理 materials 失败: " + err.Error()})
		return
	}
	if err := tx.Exec("DELETE FROM categories").Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清理 categories 失败: " + err.Error()})
		return
	}
	if err := tx.Exec("DELETE FROM material_categories").Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清理 material_categories 失败: " + err.Error()})
		return
	}
	if err := tx.Exec("DELETE FROM download_records").Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清理 download_records 失败: " + err.Error()})
		return
	}

	// 重置 SQLite 自增序列，让 ID 重新从 1 开始
	// 忽略错误：如果表内从未插入过数据，sqlite_sequence 中就不会有对应记录，更新会报错，这是正常现象
	_ = tx.Exec("UPDATE sqlite_sequence SET seq = 0 WHERE name = 'materials'").Error
	_ = tx.Exec("UPDATE sqlite_sequence SET seq = 0 WHERE name = 'categories'").Error
	_ = tx.Exec("UPDATE sqlite_sequence SET seq = 0 WHERE name = 'download_records'").Error

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交数据库清理事务失败: " + err.Error()})
		return
	}

	// 3. 只清理当前环境配置的专用素材目录。
	uploadDir := config.GlobalConfig.UploadDir
	if err := os.RemoveAll(uploadDir); err != nil {
		// 记录日志但不阻断响应，因为数据库已经清空
		log.Printf("警告: 删除上传目录 %s 失败: %v\n", uploadDir, err)
	}

	// 重建目录，确保后续上传不报错
	os.MkdirAll(filepath.Join(uploadDir, "originals"), 0755)
	os.MkdirAll(filepath.Join(uploadDir, "previews"), 0755)

	c.JSON(http.StatusOK, gin.H{"message": "素材库及分类已全量清空"})
}

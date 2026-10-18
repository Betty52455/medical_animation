package models

import (
	"time"

	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"uniqueIndex;type:varchar(64)" json:"username"`
	PasswordHash string    `gorm:"type:varchar(255)" json:"-"` // json:"-" 表示不序列化密码
	Role         string    `gorm:"type:varchar(20);default:'user'" json:"role"`
	Points       int       `gorm:"default:0" json:"points"`                    // 积分余额
	Status       int       `gorm:"type:tinyint;default:0" json:"status"`       // 用户状态（0=正常，1=异常/封禁）
	Remark       string    `gorm:"type:varchar(500);default:''" json:"remark"` // 管理员备注
	CreatedAt    time.Time `json:"created_at"`
}

// Category 分类模型（支持一级/二级分类）
type Category struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	Name        string     `gorm:"type:varchar(50)" json:"name"`
	ParentID    *uint      `gorm:"index" json:"parent_id"`
	Parent      *Category  `gorm:"foreignKey:ParentID" json:"-"`
	Type        int        `gorm:"type:tinyint" json:"type"` // 1=一级分类, 2=二级分类
	IsExclusive bool       `json:"is_exclusive"`
	Children    []Category `gorm:"foreignKey:ParentID" json:"children"`
}

// Material 素材模型
type Material struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Title       string         `gorm:"type:varchar(255)" json:"title"`
	Type        int            `gorm:"type:tinyint" json:"type"`     // 1=图片, 2=视频
	PointsCost  int            `gorm:"default:0" json:"points_cost"` // 下载所需积分（0=免费）
	OriginalURL string         `gorm:"type:varchar(512)" json:"original_url"`
	PreviewURL  string         `gorm:"type:varchar(512)" json:"preview_url"`
	CreatedAt   time.Time      `json:"created_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at"` // 软删除字段
	Categories  []Category     `gorm:"many2many:material_categories;" json:"categories"`
}

// RedeemCode 积分兑换码模型
// 管理员批量生成兑换码，用户输入兑换码获取积分
type RedeemCode struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	Code       string     `gorm:"type:varchar(32);uniqueIndex" json:"code"`        // 兑换码字符串
	Points     int        `json:"points"`                                          // 面值（积分数）
	BatchID    string     `gorm:"type:varchar(36);index" json:"batch_id"`          // 批次 ID（同一批生成共享）
	Remark     string     `gorm:"type:varchar(255);default:''" json:"remark"`      // 备注信息
	IsUsed     bool       `gorm:"default:false" json:"is_used"`                    // 是否已兑换
	UsedBy     *uint      `json:"used_by"`                                         // 兑换者 user_id
	UsedByUser *User      `gorm:"foreignKey:UsedBy" json:"used_by_user,omitempty"` // 兑换者用户信息
	UsedAt     *time.Time `json:"used_at"`                                         // 兑换时间
	CreatedAt  time.Time  `json:"created_at"`                                      // 生成时间
}

// DownloadRecord 下载记录模型
// 用于防止重复下载扣费：同一用户同一素材只扣一次积分
type DownloadRecord struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"index" json:"user_id"`     // 用户 ID
	MaterialID uint      `gorm:"index" json:"material_id"` // 素材 ID
	PointsCost int       `json:"points_cost"`              // 本次扣除积分
	CreatedAt  time.Time `json:"created_at"`               // 下载时间
}

// LoginRecord 登录记录模型
// 记录用户每次登录的 IP 和城市信息，用于运营数据统计
type LoginRecord struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index" json:"user_id"`          // 用户 ID
	IP        string    `gorm:"type:varchar(45)" json:"ip"`    // 登录 IP
	City      string    `gorm:"type:varchar(100)" json:"city"` // IP 对应城市
	CreatedAt time.Time `json:"created_at"`                    // 登录时间
}

// SystemSetting 系统配置模型
// 用于存储网站全局配置，如联系我们、公告等
type SystemSetting struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"uniqueIndex;type:varchar(50)" json:"key"` // 配置键
	Value     string    `gorm:"type:longtext" json:"value"`              // 配置值 (JSON) - 只有 longtext 才能存大图 base64
	UpdatedAt time.Time `json:"updated_at"`
}

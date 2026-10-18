package api

import (
	"net/http"
	"website_test/internal/database"
	"website_test/internal/models"

	"github.com/gin-gonic/gin"
)

func GetCategories(c *gin.Context) {
	var categories []models.Category
	// Preload children for hierarchical structure request.
	// We want all levels. If it's just 2 levels, we can preload children.
	// Since we defined Children in model, we can use Preload.
	if err := database.DB.Preload("Children").Where("parent_id IS NULL").Find(&categories).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch categories: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, categories)
}

type CreateCategoryRequest struct {
	Name        string `json:"name" binding:"required"`
	ParentID    *uint  `json:"parent_id"`
	Type        int    `json:"type" binding:"required"`
	IsExclusive bool   `json:"is_exclusive"`
}

func CreateCategory(c *gin.Context) {
	var req CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	category := models.Category{
		Name:        req.Name,
		ParentID:    req.ParentID,
		Type:        req.Type,
		IsExclusive: req.IsExclusive,
	}

	if err := database.DB.Create(&category).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create category: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, category)
}

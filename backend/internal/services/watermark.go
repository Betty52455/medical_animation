package services

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"website_test/internal/config"
)

// getFontPath 根据操作系统自动选择可用的中文字体路径
// macOS: 按存在性选择 PingFang 或系统自带的黑体，兼容字体位置变化。
// Linux: 优先使用文泉驿微米黑 → Noto Sans CJK → DejaVu Sans 兜底
func getFontPath() string {
	if runtime.GOOS == "darwin" {
		for _, p := range []string{
			"/System/Library/Fonts/PingFang.ttc",
			"/System/Library/Fonts/STHeiti Medium.ttc",
			"/System/Library/Fonts/STHeiti Light.ttc",
			"/Library/Fonts/Arial Unicode.ttf",
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}

	// Linux 常见中文字体路径（按优先级排列）
	linuxFontPaths := []string{
		"/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",         // 文泉驿微米黑（Ubuntu apt 安装）
		"/usr/share/fonts/wqy-microhei/wqy-microhei.ttc",         // 文泉驿微米黑（CentOS yum 安装）
		"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", // Noto Sans CJK
		"/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",      // Noto Sans CJK（另一路径）
		"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",        // DejaVu Sans（兜底，无中文但不会报错）
	}

	for _, p := range linuxFontPaths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}

	// 最终兜底：返回一个通用名称，让 ffmpeg 自行查找
	return "sans-serif"
}

// InitStorage 初始化上传文件存储目录
func InitStorage() {
	for _, name := range []string{"originals", "previews"} {
		if err := os.MkdirAll(filepath.Join(config.GlobalConfig.UploadDir, name), 0755); err != nil {
			log.Fatalf("无法初始化素材目录: %v", err)
		}
	}
}

// buildDenseWatermark 生成密集平铺水印的 ffmpeg drawtext 滤镜链
// 水印文字以错位网格排列，覆盖整张图片
func buildDenseWatermark(fontPath, text string, fontSize int, opacity float64) string {
	var filters []string
	// 每 200px 一列，每 80px 一行，奇数行右移 100px 形成错位效果
	for row := 0; row < 12; row++ {
		xOffset := 0
		if row%2 == 1 {
			xOffset = 100
		}
		for col := 0; col < 6; col++ {
			x := col*200 + xOffset
			y := row * 80
			filter := fmt.Sprintf(
				"drawtext=fontfile='%s':text='%s':fontsize=%d:fontcolor=white@%.1f:x=%d:y=%d",
				fontPath, text, fontSize, opacity, x, y,
			)
			filters = append(filters, filter)
		}
	}
	return strings.Join(filters, ",")
}

// ProcessMaterial 处理上传的素材，生成带密集水印的预览文件
// 1. 图片：缩放+密集平铺水印，输出为JPEG
// 2. 视频：截取第1秒的帧，生成带密集水印的JPEG缩略图
func ProcessMaterial(filePath string, materialType int) (string, error) {
	filename := filepath.Base(filePath)
	fontPath := getFontPath()
	watermarkText := "趣味科普网"

	var cmd *exec.Cmd
	var previewPath string

	if materialType == 1 {
		// ========== 图片处理 ==========
		// 缩放到宽度800px，密集平铺水印
		previewPath = filepath.Join(config.GlobalConfig.UploadDir, "previews", filename)
		watermarkFilter := buildDenseWatermark(fontPath, watermarkText, 28, 0.3)
		filter := fmt.Sprintf("scale=800:-1,%s", watermarkFilter)
		cmd = exec.Command("ffmpeg", "-y", "-i", filePath, "-vf", filter, previewPath)
	} else {
		// ========== 视频处理 ==========
		// 截取第1秒的帧，生成JPEG缩略图并密集平铺水印
		nameWithoutExt := strings.TrimSuffix(filename, filepath.Ext(filename))
		previewPath = filepath.Join(config.GlobalConfig.UploadDir, "previews", nameWithoutExt+".jpg")
		watermarkFilter := buildDenseWatermark(fontPath, watermarkText, 20, 0.3)
		filter := fmt.Sprintf("scale=640:-2,%s", watermarkFilter)
		cmd = exec.Command("ffmpeg", "-y", "-ss", "1", "-i", filePath,
			"-vf", filter, "-vframes", "1", "-q:v", "2", previewPath)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("ffmpeg error: %v, output: %s", err, string(output))
	}

	return previewPath, nil
}

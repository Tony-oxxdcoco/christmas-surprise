#!/bin/bash

# GitHub Pages 自动部署脚本

echo "🎄 GitHub Pages 部署助手"
echo ""

# 检查是否已设置远程仓库
if git remote get-url origin >/dev/null 2>&1; then
    echo "✅ 远程仓库已设置"
    REMOTE_URL=$(git remote get-url origin)
    echo "   远程地址: $REMOTE_URL"
else
    echo "⚠️  请先设置远程仓库"
    echo ""
    read -p "请输入你的 GitHub 用户名: " GITHUB_USER
    read -p "请输入仓库名称 (默认: christmas-surprise): " REPO_NAME
    REPO_NAME=${REPO_NAME:-christmas-surprise}
    
    REMOTE_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"
    echo ""
    echo "📝 请先在 GitHub 创建仓库: https://github.com/new"
    echo "   仓库名称: $REPO_NAME"
    echo "   选择: Public"
    echo "   不要勾选 README"
    echo ""
    read -p "创建完成后按回车继续..."
    
    git remote add origin "$REMOTE_URL"
    echo "✅ 已添加远程仓库"
fi

echo ""
echo "🚀 推送到 GitHub..."
git branch -M main
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
    echo ""
    echo "📱 现在去启用 GitHub Pages:"
    echo "   1. 打开: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\([^.]*\).*/\1\/\2/')"
    echo "   2. 点击 Settings > Pages"
    echo "   3. Source 选择: main branch, / (root)"
    echo "   4. 点击 Save"
    echo ""
    echo "   等待 1-2 分钟，你会得到链接:"
    echo "   https://$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\([^.]*\).*/\1.github.io\/\2/')"
else
    echo ""
    echo "❌ 推送失败，请检查："
    echo "   - 是否已创建 GitHub 仓库"
    echo "   - 是否已登录 GitHub"
    echo "   - 网络连接是否正常"
fi


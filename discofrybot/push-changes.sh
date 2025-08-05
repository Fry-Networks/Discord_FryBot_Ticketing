#!/bin/bash

echo "📦 Checking Git status..."
git status

echo
echo "🔍 Showing Git diff..."
git diff

echo
read -p "📝 Enter a commit message: " commit_message

echo
echo "📥 Staging all changes..."
git add .

echo "✅ Committing with your message: \"$commit_message\""
git commit -m "$commit_message"

echo "🚀 Pushing to GitHub..."
git push

echo "🎉 Done!"

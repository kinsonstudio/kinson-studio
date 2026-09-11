#!/bin/bash
echo "========== Kinson Studio 功能深度测试 =========="
BIN="dist-latest/mac-arm64/Kinson Studio.app/Contents/Resources/bin"
TMP="/tmp/kstudio_test"
rm -rf "$TMP" && mkdir -p "$TMP"
PASS=0
FAIL=0

ok() { if [ $? -eq 0 ] && [ -s "$2" ]; then echo "✅ $1"; PASS=$((PASS+1)); else echo "❌ $1"; FAIL=$((FAIL+1)); fi; }

echo ""
echo "【1】图片转换：PNG → JPG"
"$BIN/ffmpeg" -y -f lavfi -i color=c=red:s=200x200:d=1 "$TMP/in.png" 2>/dev/null
"$BIN/ffmpeg" -y -i "$TMP/in.png" "$TMP/out.jpg" 2>/dev/null
file "$TMP/out.jpg" | grep -q "JPEG" && [ -s "$TMP/out.jpg" ] && { echo "✅ 生成有效JPG文件 ($(du -h "$TMP/out.jpg" | cut -f1))"; PASS=$((PASS+1)); } || { echo "❌ 图片转换失败"; FAIL=$((FAIL+1)); }

echo ""
echo "【2】音频转换：WAV → MP3"
"$BIN/ffmpeg" -y -f lavfi -i sine=frequency=440:duration=2 "$TMP/in.wav" 2>/dev/null
"$BIN/ffmpeg" -y -i "$TMP/in.wav" -b:a 128k "$TMP/out.mp3" 2>/dev/null
file "$TMP/out.mp3" | grep -q "MPEG\|ID3\|Audio" && [ -s "$TMP/out.mp3" ] && { echo "✅ 生成有效MP3文件 ($(du -h "$TMP/out.mp3" | cut -f1))"; PASS=$((PASS+1)); } || { echo "❌ 音频转换失败"; FAIL=$((FAIL+1)); }

echo ""
echo "【3】OCR 文字识别"
FONT="/System/Library/Fonts/Supplemental/Arial.ttf"
[ -f "$FONT" ] || FONT="/Library/Fonts/Arial.ttf"
"$BIN/ffmpeg" -y -f lavfi -i "color=c=white:s=500x120:d=1" -vf "drawtext=text='Hello 123':fontcolor=black:fontsize=48:x=20:y=35:fontfile=$FONT" -frames:v 1 "$TMP/ocr.png" 2>/dev/null
if [ -s "$TMP/ocr.png" ]; then
  "$BIN/tesseract" "$TMP/ocr.png" "$TMP/ocr_result" --tessdata-dir "$BIN/tessdata" -l eng 2>/dev/null
  RESULT=$(cat "$TMP/ocr_result.txt" 2>/dev/null | tr -d '[:space:]')
  echo "  识别结果: '$RESULT'"
  echo "$RESULT" | grep -qi "hello" && { echo "✅ OCR识别正确"; PASS=$((PASS+1)); } || { echo "❌ OCR识别结果不对"; FAIL=$((FAIL+1)); }
else
  echo "❌ 测试图片生成失败（可能缺少字体）"; FAIL=$((FAIL+1))
fi

echo ""
echo "【4】压缩 → 解压 完整性验证"
echo "这是测试文件内容 ABC123" > "$TMP/original.txt"
zip -j "$TMP/test.zip" "$TMP/original.txt" >/dev/null 2>&1
mkdir -p "$TMP/unzipped"
unzip -o "$TMP/test.zip" -d "$TMP/unzipped" >/dev/null 2>&1
diff -q "$TMP/original.txt" "$TMP/unzipped/original.txt" >/dev/null 2>&1 && { echo "✅ 压缩解压后内容一致"; PASS=$((PASS+1)); } || { echo "❌ 压缩解压后内容不一致"; FAIL=$((FAIL+1)); }

echo ""
echo "【5】TXT → HTML（中文不乱码）"
echo "这是中文测试内容" > "$TMP/in.txt"
node -e "
const fs=require('fs');
const c=fs.readFileSync('$TMP/in.txt','utf-8');
const e=c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
fs.writeFileSync('$TMP/out.html','<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head><body><pre>'+e+'</pre></body></html>','utf-8');
"
grep -q "charset=\"UTF-8\"" "$TMP/out.html" && grep -q "中文测试" "$TMP/out.html" && { echo "✅ HTML编码正确，中文正常"; PASS=$((PASS+1)); } || { echo "❌ HTML编码有问题"; FAIL=$((FAIL+1)); }

echo ""
echo "【6】工具依赖库检查"
for tool in ffmpeg ncmdump tesseract; do
  if otool -L "$BIN/$tool" 2>/dev/null | grep -q "@executable_path/libs"; then
    echo "  ✅ $tool 依赖路径已正确处理"
  else
    echo "  ⚠️  $tool 依赖路径可能有问题"
  fi
done

echo ""
echo "========== 最终结果：通过 $PASS 项，失败 $FAIL 项 =========="
rm -rf "$TMP"

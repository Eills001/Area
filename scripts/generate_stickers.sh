#!/usr/bin/env bash
# 生成 AREA 可爱表情包 sticker 图库
# 使用 ImageMagick 绘制圆角卡通风格贴图

STICKER_DIR="$HOME/.hermes/skills/AI陪伴/Hermes-Companion/assets/stickers"
W=300
H=300
FONT_SIZE=40

# 圆角矩形工具函数
make_sticker() {
  local out="$1"
  local bg_color="$2"
  local text="$3"
  local icon="$4"
  local subtext="${5:-}"

  # 基础圆角背景
  convert -size ${W}x${H} xc:"${bg_color}" \
    -fill white -draw "roundrectangle 2,2 $((W-3)),$((H-3)) 30,30" \
    -shave 1x1 \
    -fill "#00000008" -draw "roundrectangle $((W-40)),$((H-40)) $((W-8)),$((H-8)) 15,15" \
    "${out}.tmp.png"

  # 主文字（大）
  convert "${out}.tmp.png" \
    -font "$(convert -list font | grep -i -m1 "^  Font:" | sed 's/^  Font: //')" \
    -fill "#333333" -pointsize $FONT_SIZE \
    -gravity center -annotate +0-20 "${text}" \
    "${out}.tmp2.png"

  # 副文字（小）
  if [ -n "$subtext" ]; then
    convert "${out}.tmp2.png" \
      -fill "#888888" -pointsize 20 \
      -gravity center -annotate +0+40 "${subtext}" \
      "${out}"
  else
    mv "${out}.tmp2.png" "${out}"
  fi

  rm -f "${out}.tmp.png" "${out}.tmp2.png"
  echo "  ✅ $out"
}

echo "生成 AREA 表情包贴图..."
echo ""

# ── 早安类 ──
mkdir -p "$STICKER_DIR/morning"
make_sticker "$STICKER_DIR/morning/早安_01.png" "#FFF5E6" "☀️" "" "早安呀"
make_sticker "$STICKER_DIR/morning/早安_02.png" "#FFE4E1" "🌅" "" "新的一天"
make_sticker "$STICKER_DIR/morning/加油_01.png" "#E8F5E9" "💪" "" "今天也加油"

# ── 晚安类 ──
mkdir -p "$STICKER_DIR/night"
make_sticker "$STICKER_DIR/night/晚安_01.png" "#E8EAF6" "🌙" "" "晚安好梦"
make_sticker "$STICKER_DIR/night/晚安_02.png" "#F3E5F5" "⭐" "" "早点休息"
make_sticker "$STICKER_DIR/night/晚安_03.png" "#E0F2F1" "😴" "" "睡个好觉"

# ── 温暖类 ──
mkdir -p "$STICKER_DIR/warm"
make_sticker "$STICKER_DIR/warm/抱抱_01.png" "#FCE4EC" "🤗" "" "给你一个抱抱"
make_sticker "$STICKER_DIR/warm/暖心_01.png" "#FFF3E0" "❤️" "" "我在呢"
make_sticker "$STICKER_DIR/warm/想你_01.png" "#F3E5F5" "💕" "" "想你了"

# ── 开心类 ──
mkdir -p "$STICKER_DIR/happy"
make_sticker "$STICKER_DIR/happy/开心_01.png" "#FFF9C4" "😄" "" "太棒了！"
make_sticker "$STICKER_DIR/happy/庆祝_01.png" "#E8F5E9" "🎉" "" "恭喜！"
make_sticker "$STICKER_DIR/happy/棒_01.png" "#E3F2FD" "👍" "" "你很棒！"

# ── 安慰类 ──
mkdir -p "$STICKER_DIR/comfort"
make_sticker "$STICKER_DIR/comfort/别难过_01.png" "#E8EAF6" "🥺" "" "别难过"
make_sticker "$STICKER_DIR/comfort/陪着你_01.png" "#FCE4EC" "🫂" "" "陪着你呢"
make_sticker "$STICKER_DIR/comfort/会好的_01.png" "#E0F2F1" "🌈" "" "一切都会好的"

# ── 吐槽类 ──
mkdir -p "$STICKER_DIR/tease"
make_sticker "$STICKER_DIR/tease/哈哈_01.png" "#FFF3E0" "😂" "" "笑死我了"
make_sticker "$STICKER_DIR/tease/懂了_01.png" "#F3E5F5" "😏" "" "我懂的～"

# ── 鼓励类 ──
mkdir -p "$STICKER_DIR/encourage"
make_sticker "$STICKER_DIR/encourage/冲_01.png" "#FFEBEE" "🔥" "" "冲冲冲！"
make_sticker "$STICKER_DIR/encourage/你可以_01.png" "#E8F5E9" "💪" "" "你可以的！"
make_sticker "$STICKER_DIR/encourage/相信自己_01.png" "#E3F2FD" "✨" "" "相信自己"

# ── 趣味类 ──
mkdir -p "$STICKER_DIR/fun"
make_sticker "$STICKER_DIR/fun/摸鱼_01.png" "#FFF9C4" "🐟" "" "摸鱼中"
make_sticker "$STICKER_DIR/fun/收到_01.png" "#F5F5F5" "👌" "" "收到"
make_sticker "$STICKER_DIR/fun/好的_01.png" "#ECEFF1" "✅" "" "好滴～"

echo ""
echo "✨ 全部生成完毕！"
echo "📁 $STICKER_DIR"
echo "总数量: $(find "$STICKER_DIR" -name "*.png" | wc -l) 张"

#!/usr/bin/env python3
"""
从 npm 已下载的 OpenMoji SVG 包转换为 AREA 的表情包 PNG sticker。
OpenMoji 是 CC BY-SA 4.0 开源协议。
"""
import subprocess, os, sys, json

STICKER_DIR = os.path.expanduser(
    "~/.hermes/skills/AI陪伴/Hermes-Companion/assets/stickers"
)
SVG_DIR = "/tmp/package/color/svg"

# sticker 类别 → [(文件名, Unicode codepoint hex, 描述)]
STICKERS = {
    "morning": [
        ("sunrise", "1F305", "日出"),
        ("sun", "2600", "太阳"),
        ("coffee", "2615", "咖啡"),
        ("cherry_blossom", "1F338", "樱花"),
        ("sunflower", "1F33B", "向日葵"),
    ],
    "night": [
        ("crescent_moon", "1F319", "月亮"),
        ("glowing_star", "1F31F", "星星"),
        ("sparkles", "2728", "闪星"),
        ("sleeping", "1F634", "睡觉"),
        ("night", "1F303", "夜景"),
    ],
    "warm": [
        ("smile", "1F60A", "微笑"),
        ("hug", "1F917", "拥抱"),
        ("heart", "2764", "红心"),
        ("sparkling_heart", "1F496", "闪心"),
        ("two_hearts", "1F495", "双心"),
        ("heart_exclamation", "2763", "感叹心"),
    ],
    "happy": [
        ("joy", "1F602", "笑 cry"),
        ("party", "1F389", "派对"),
        ("tada", "1F38A", "彩花"),
        ("clap", "1F44F", "鼓掌"),
        ("raised_hands", "1F64C", "举手"),
    ],
    "comfort": [
        ("pleading", "1F97A", "恳求"),
        ("hug_face", "1F917", "抱脸"),
        ("tulip", "1F337", "郁金香"),
        ("rainbow", "1F308", "彩虹"),
        ("herb", "1F33F", "四叶草"),
    ],
    "tease": [
        ("sweat_smile", "1F605", "汗笑"),
        ("wink", "1F609", "眨眼"),
        ("smirk", "1F60F", "歪嘴笑"),
        ("see_no_evil", "1F648", "非礼勿视"),
        ("speak_no_evil", "1F64A", "非礼勿言"),
    ],
    "encourage": [
        ("muscle", "1F4AA", "肱二头肌"),
        ("fire", "1F525", "火"),
        ("rocket", "1F680", "火箭"),
        ("star_struck", "1F929", "星星眼"),
        ("sparkler", "1F387", "烟花"),
    ],
    "fun": [
        ("ok_hand", "1F44C", "OK 手"),
        ("check", "2705", "对勾"),
        ("wave", "1F44B", "招手"),
        ("folded_hands", "1F64F", "合十"),
        ("smile_cat", "1F638", "笑猫"),
    ],
}


def svg_to_png(svg_path, png_path, size=300):
    """Convert SVG to PNG with ImageMagick."""
    # ImageMagick SVG render: add white background, resize, nice quality
    cmd = [
        "convert", "-background", "none",
        "-size", f"{size}x{size}",
        svg_path,
        "-background", "white",
        "-flatten",
        "-gravity", "center",
        "-extent", f"{size}x{size}",
        png_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        # Try simpler approach
        cmd2 = ["convert", "-background", "white", svg_path, "-resize", f"{size}x{size}", "-gravity", "center", "-extent", f"{size}x{size}", png_path]
        result2 = subprocess.run(cmd2, capture_output=True, text=True, timeout=30)
        return result2.returncode == 0
    return True


def main():
    global SVG_DIR
    if not os.path.exists(SVG_DIR):
        # Check in the extracted package
        alt_dir = "/tmp/package/color/svg"
        if os.path.exists(alt_dir):
            SVG_DIR = alt_dir
        else:
            print(f"❌ OpenMoji SVG 目录未找到。请先运行: cd /tmp && npm pack openmoji && tar xf openmoji-*.tgz")
            sys.exit(1)

    total = sum(len(v) for v in STICKERS.values())
    done = 0

    print(f"📥 从 OpenMoji (CC BY-SA 4.0) 转换 SVG → PNG sticker...")
    print(f"   共 {total} 个, {len(STICKERS)} 个目录\n")

    for category, items in STICKERS.items():
        cat_dir = os.path.join(STICKER_DIR, category)
        os.makedirs(cat_dir, exist_ok=True)

        for filename, hex_code, desc in items:
            # 6-character codepoints with FE0F variation selector
            hex_variants = [hex_code]
            if len(hex_code) <= 4:
                hex_variants.append(hex_code + "-FE0F")

            svg_found = None
            for h in hex_variants:
                test_path = os.path.join(SVG_DIR, f"{h}.svg")
                if os.path.exists(test_path):
                    svg_found = test_path
                    break

            if not svg_found:
                # Try with FE0F-200D-... combinations
                # Some emoji have multi-codepoint sequences
                print(f"  ⚠️  {category}/{filename} ({hex_code}) SVG 未找到, 跳过")
                continue

            output = os.path.join(cat_dir, f"{filename}.png")
            if os.path.exists(output) and os.path.getsize(output) > 2000:
                print(f"  ⏭️  {category}/{filename}.png 已存在")
                done += 1
                continue

            if svg_to_png(svg_found, output):
                size = os.path.getsize(output)
                print(f"  ✅ {category}/{filename}.png ({size} bytes)")
                done += 1
            else:
                print(f"  ❌ {category}/{filename} 转换失败")

    # 生成图库索引
    index = {}
    for category in STICKERS:
        cat_dir = os.path.join(STICKER_DIR, category)
        if not os.path.isdir(cat_dir):
            continue
        files = sorted([
            f for f in os.listdir(cat_dir)
            if f.endswith(".png") and os.path.getsize(os.path.join(cat_dir, f)) > 500
        ])
        if files:
            index[category] = files

    with open(os.path.join(STICKER_DIR, "index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"\n📊 完成: {done}/{total} 成功")
    print(f"📁 图库: {STICKER_DIR}")
    print(f"   {sum(len(v) for v in index.values())} 张 sticker ✨")


if __name__ == "__main__":
    main()

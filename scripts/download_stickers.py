#!/usr/bin/env python3
"""
Download OpenMoji emoji as sticker PNGs for AREA's companion engine.
OpenMoji is CC BY-SA 4.0 — free for any use with attribution.
"""

import urllib.request
import os
import sys
import json

STICKER_DIR = os.path.expanduser(
    "~/.hermes/skills/AI陪伴/Hermes-Companion/assets/stickers"
)

# Emoji map: category → [(filename, hex_codepoint, alt_text)]
# Using OpenMoji color 72x72 PNGs
STICKERS = {
    "morning": [
        ("sunrise", "1F305", "sunrise"),
        ("sun", "2600", "sun"),
        ("coffee", "2615", "hot beverage"),
        ("blossom", "1F33C", "cherry blossom"),
    ],
    "night": [
        ("crescent_moon", "1F319", "crescent moon"),
        ("star", "2B50", "star"),
        ("sparkles", "2728", "sparkles"),
        ("sleeping", "1F634", "sleeping face"),
    ],
    "warm": [
        ("smiling_face", "1F60A", "smiling face with smiling eyes"),
        ("hug", "1FAC2", "people hugging"),
        ("heart", "2764", "red heart"),
        ("sparkling_heart", "1F496", "sparkling heart"),
        ("two_hearts", "1F495", "two hearts"),
    ],
    "happy": [
        ("grinning", "1F604", "grinning face"),
        ("party_popper", "1F389", "party popper"),
        ("confetti", "1F38A", "confetti ball"),
        ("clapping", "1F44F", "clapping hands"),
    ],
    "comfort": [
        ("pleading", "1F97A", "pleading face"),
        ("hugging_face", "1F917", "hugging face"),
        ("blossom_flower", "1F337", "tulip"),
        ("rainbow", "1F308", "rainbow"),
    ],
    "tease": [
        ("joy", "1F602", "face with tears of joy"),
        ("winking", "1F609", "winking face"),
        ("smirk", "1F60F", "smirking face"),
        ("see_no_evil", "1F648", "see-no-evil monkey"),
    ],
    "encourage": [
        ("flexed_biceps", "1F4AA", "flexed biceps"),
        ("fire", "1F525", "fire"),
        ("rocket", "1F680", "rocket"),
        ("glowing_star", "1F31F", "glowing star"),
    ],
    "fun": [
        ("ok_hand", "1F44C", "OK hand"),
        ("check_mark", "2705", "check mark"),
        ("wave", "1F44B", "waving hand"),
        ("folded_hands", "1F64F", "folded hands"),
    ],
}

BASE_URL = "https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/src/symbols/"


def download_sticker(category, filename, hex_code, alt_text):
    """Download one OpenMoji PNG and save as sticker."""
    cat_dir = os.path.join(STICKER_DIR, category)
    os.makedirs(cat_dir, exist_ok=True)

    output_path = os.path.join(cat_dir, f"{filename}.png")

    if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
        return True  # already exists

    # OpenMoji stores files in subdirectories by hex prefix
    subdir = hex_code[:2] if len(hex_code) > 2 else hex_code
    url = f"{BASE_URL}{subdir}/{hex_code}.png"

    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Hermes-Companion/1.0"
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            if len(data) < 100:
                return False
            with open(output_path, "wb") as f:
                f.write(data)
            print(f"  ✅ {category}/{filename}.png ({len(data)} bytes)")
            return True
    except Exception as e:
        print(f"  ❌ {category}/{filename}: {e}")
        return False


def main():
    total = sum(len(v) for v in STICKERS.values())
    downloaded = 0
    failed = 0

    print(f"📥 下载 OpenMoji 表情当做 sticker...")
    print(f"   共 {total} 个, 分类至 {len(STICKERS)} 个目录\n")

    for category, items in STICKERS.items():
        for filename, hex_code, alt_text in items:
            if download_sticker(category, filename, hex_code, alt_text):
                downloaded += 1
            else:
                failed += 1

    print(f"\n📊 结果: {downloaded} 成功, {failed} 失败")

    # 生成图库索引 JSON
    index = {}
    for category in STICKERS:
        cat_dir = os.path.join(STICKER_DIR, category)
        if not os.path.isdir(cat_dir):
            continue
        files = [
            f for f in os.listdir(cat_dir)
            if f.endswith(".png") and os.path.getsize(os.path.join(cat_dir, f)) > 1000
        ]
        if files:
            index[category] = files

    index_path = os.path.join(STICKER_DIR, "index.json")
    with open(index_path, "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"📝 索引已保存: {index_path}")

    # 统计
    total_files = sum(len(v) for v in index.values())
    print(f"\n📦 图库总计: {total_files} 张 sticker ✨")


if __name__ == "__main__":
    main()

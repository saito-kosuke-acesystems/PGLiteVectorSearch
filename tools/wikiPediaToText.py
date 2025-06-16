import requests
import html2text
import os
import re

# wikiPediaToText.py
# 日本語版ウィキペからテキストデータを取得するスクリプト

URL = "https://ja.wikipedia.org/w/api.php"
title = "機動戦士Gundam_GQuuuuuuX"

PARAMS = {
    "action": "parse",
    "page": title,
    "format": "json",
    "prop": "text"
}

R = requests.get(url=URL, params=PARAMS)
DATA = R.json()
html = DATA["parse"]["text"]["*"]

# HTMLをマークダウンに変換
markdown = html2text.html2text(html)

# 画像を含むリンクを削除
markdown = re.sub(r'\[!\[.*?\]\(.*?\)\]\([^)]+\)', '', markdown, flags=re.DOTALL)

# 通常の画像リンクを削除
markdown = re.sub(r'!\[.*?\]\(.*?\)', '', markdown, flags=re.DOTALL)

# 通常のリンクをテキスト化
markdown = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', markdown, flags=re.DOTALL)

# ファイル保存例
dir = "./download"
if not os.path.exists(dir):
    # 無かったら作成
    os.makedirs(dir)
with open(dir + "/" + title +"_2.md", "w", encoding="utf-8") as f:
    f.write(markdown)

print(markdown)
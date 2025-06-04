import requests
import os

# wikiPediaToText.py
# 日本語版ウィキペからテキストデータを取得するスクリプト
S = requests.Session()

URL = "https://ja.wikipedia.org/w/api.php"
title = "機動戦士Gundam GQuuuuuuX"  # 取得したいページのタイトルを指定

PARAMS = {
    "action": "query",
    "prop": "extracts",
    "explaintext": 1,
    "titles": title,
    "format": "json"
}

R = S.get(url=URL, params=PARAMS)
DATA = R.json()

pages = DATA["query"]["pages"]
for page_id in pages:
    extract = pages[page_id]["extract"]
    # 先頭に概要と記載
    extract = "# 概要\n\n" + extract
    # md形式の見出しに変換
    extract = extract.replace("\n==== ", "### ")
    extract = extract.replace("\n=== ", "## ")
    extract = extract.replace("\n== ", "# ")
    extract = extract.replace(" ====", "")
    extract = extract.replace(" ===", "")
    extract = extract.replace(" ==", "")

    # テキストデータをdownloadフォルダに保存
    dir = "./download"
    if not os.path.exists(dir):
        # 無かったら作成
        os.makedirs(dir)
    with open(dir + "/" + title +".md", "w", encoding="utf-8") as f:
        f.write(extract)
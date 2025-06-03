import requests
# wikiPediaToText.py
# 日本語版ウィキペからテキストデータを取得するスクリプト
S = requests.Session()

URL = "https://ja.wikipedia.org/w/api.php"

PARAMS = {
    "action": "query",
    "prop": "extracts",
    "explaintext": 1,
    "titles": "機動戦士Gundam GQuuuuuuX",  # ここに取得したいページ名を指定
    "format": "json"
}

R = S.get(url=URL, params=PARAMS)
DATA = R.json()

pages = DATA["query"]["pages"]
for page_id in pages:
    print(pages[page_id]["extract"])
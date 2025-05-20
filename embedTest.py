from openai import OpenAI

# OpenAIライブラリを使用してOllamaへ接続
client = OpenAI(
    base_url = 'http://localhost:11434/v1',
    api_key='ollama', # キーは適当な文字列で良いらしい
)

# プロンプトを入力
user_message = "本日の掃除当番は斎藤です。"

# 文字列をベクトル化
response = client.embeddings.create(
  model="kun432/cl-nagoya-ruri-base:latest",
  input=user_message
)

# 生成された応答を出力
# print(response.choices[0].message.content)
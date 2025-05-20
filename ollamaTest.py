from openai import OpenAI

# OpenAIライブラリを使用してOllamaへ接続
client = OpenAI(
    base_url = 'http://localhost:11434/v1',
    api_key='ollama', # キーは適当な文字列で良いらしい
)

# プロンプトを入力
system_message = "必ず日本語で回答してください。"
user_message = "pythonという言語の特徴を教えてください。"

# 応答の生成
response = client.chat.completions.create(
  model="gemma3:1b",
  messages=[
    {"role": "system", "content": system_message},
    {"role": "user", "content": user_message}
  ]
)

# 生成された応答を出力
print(response.choices[0].message.content)
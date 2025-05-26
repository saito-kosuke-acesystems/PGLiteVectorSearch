import { OpenAI } from 'openai';

// OpenAI SDKでOllamaのローカルエンドポイントを使用
const openai = new OpenAI({
    baseURL: 'http://localhost:11434/v1', // Ollamaのエンドポイント
    apiKey: 'ollama', // Ollamaの場合APIキーは不要（適当な文字列で良い）
    dangerouslyAllowBrowser: true, // ブラウザからのAPIアクセスを許可（通常はセキュリティリスクから非推奨だが、ローカル利用なので問題無し）
});

// Ollama上で使用するLLM名
const chatModel = 'gemma3:1b';
const embedModel = 'kun432/cl-nagoya-ruri-base:latest';

export async function generateChatMessage(userMessage: string): Promise<string> {
    try {
        const response = await openai.chat.completions.create({
            model: chatModel,
            messages: [
                { role: 'system', content: '必ず日本語で回答してください。' },
                { role: 'user', content: userMessage }
            ]
        });

        return response.choices[0].message?.content || '';
    } catch (error) {
        return '';
    }
}

export async function generateEmbedding(userMessage: string): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: embedModel,
            input: userMessage
        });

        return response.data[0].embedding || [];
    } catch (error) {
        return [];
    }
}
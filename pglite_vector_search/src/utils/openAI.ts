import { OpenAI } from 'openai';

// OpenAI SDKでOllamaのローカルエンドポイントを使用
const openai = new OpenAI({
    baseURL: 'http://localhost:11434/v1', // Ollamaのエンドポイント
    apiKey: 'ollama', // Ollamaの場合APIキーは不要（適当な文字列で良い）
    dangerouslyAllowBrowser: true, // ブラウザからのAPIアクセスを許可（セキュリティリスクがあるので通常は非推奨だが、ローカル利用なので問題無し）
});

// Ollama上で使用するLLM名
const chatModel = 'gemma3:1b';
const embeddingModel = 'kun432/cl-nagoya-ruri-base:latest';

export async function generateChatMessage(userMessage: string, memory: any[]): Promise<string> {
    try {
        // システムプロンプト作成
        const systemPrompt = memory.length > 0
            ? `以下の情報を参考にして、ユーザの質問に答えてください。\n${memory.map(m => m.content).join('\n')}`
            : 'ユーザの質問に答えてください。';

        const response = await openai.chat.completions.create({
            model: chatModel,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ]
        });

        return response.choices[0].message?.content || '';
    } catch (error) {
        console.error('Error generating chat message:', error);
        return '';
    }
}

export async function generateEmbedding(userMessage: string): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: embeddingModel,
            input: userMessage,
            encoding_format: "float",
        });

        return response.data?.[0]?.embedding || [];        
    } catch (error) {
        console.error('Error generating embedding:', error);
        return [];
    }
}

export async function getDimension(): Promise<number> {
    try {
        const response = await openai.embeddings.create({
            model: embeddingModel,
            input: "テスト",
            encoding_format: "float"
        });
        const dimension = response.data?.[0]?.embedding.length;
        return dimension;
    } catch (error) {
        console.error('Error getting model dimension:', error);
        throw error;
    }
}
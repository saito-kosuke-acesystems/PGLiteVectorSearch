import { OpenAI } from 'openai';

// baseURL, chatModel, embeddingModelを外部からセットできるようにする
let openai: OpenAI | null = null;
let currentBaseURL = 'http://localhost:11434/v1';
let currentChatModel = 'gemma3:1b';
let currentEmbeddingModel = 'kun432/cl-nagoya-ruri-base:latest';

export function setOpenAIConfig({ baseURL, chatModel, embeddingModel }: { baseURL: string, chatModel: string, embeddingModel: string }) {
    currentBaseURL = baseURL;
    currentChatModel = chatModel;
    currentEmbeddingModel = embeddingModel;
    openai = new OpenAI({
        baseURL: currentBaseURL,
        apiKey: 'ollama',
        dangerouslyAllowBrowser: true,
    });
}

// 初期化
setOpenAIConfig({
    baseURL: currentBaseURL,
    chatModel: currentChatModel,
    embeddingModel: currentEmbeddingModel
});

export async function generateChatMessage(userMessage: string, memory: any[]): Promise<string> {
    try {
        // システムプロンプト作成
        const systemPrompt = memory.length > 0
            ? `以下の情報を参考にして、ユーザの質問に答えてください。\n${memory.map(m => m.content).join('\n')}`
            : 'ユーザの質問に答えてください。';

        if (!openai) throw new Error('OpenAIクライアントが初期化されていません');
        const response = await openai.chat.completions.create({
            model: currentChatModel,
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
        if (!openai) throw new Error('OpenAIクライアントが初期化されていません');
        const response = await openai.embeddings.create({
            model: currentEmbeddingModel,
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
        if (!openai) throw new Error('OpenAIクライアントが初期化されていません');
        const response = await openai.embeddings.create({
            model: currentEmbeddingModel,
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

export function getCurrentConfig() {
    return {
        baseURL: currentBaseURL,
        chatModel: currentChatModel,
        embeddingModel: currentEmbeddingModel
    };
}
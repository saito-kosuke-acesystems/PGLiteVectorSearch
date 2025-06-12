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

export async function generateKeyWord(userMessage: string): Promise<string> {
    try {
        if (!openai) throw new Error('OpenAIクライアントが初期化されていません');

        const systemPrompt = `ユーザの質問に含まれるキーワードを以下のルールで抽出してください。余分な説明は含めないでください。
        ・キーワードをダブルクォーテーション（"）で囲む
        ・キーワードはカンマ（,）で区切る
        ・キーワードは2文字以上の単語であること
        例: "キーワード1","キーワード2","キーワード3"`;

        const response = await openai.chat.completions.create({
            model: currentChatModel,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                { role: 'user', content: userMessage }
            ]
        });

        const content = response.choices?.[0]?.message?.content;
        return content || '';
    } catch (error) {
        console.error('Error generating keyword:', error);
        throw error;
    }
}

export async function* streamChatMessage(userMessage: string, memory: any[]): AsyncGenerator<string> {
    try {
        if (!openai) throw new Error('OpenAIクライアントが初期化されていません');
        const systemPrompt = memory.length > 0
            ? `与えられた以下の情報のみを使用して、ユーザの質問に答えてください。
            参考情報：\n${memory.map(m => m.content).join('\n')}`
            : 'ユーザの質問に答えてください。';

        const stream = await openai.chat.completions.create({
            model: currentChatModel,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            stream: true,
            temperature: 0.0,    // 低い値で決定論的な応答に
            top_p: 0.7,          // 出力の多様性を制限
        });

        for await (const chunk of stream) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield content;
        }
    } catch (error) {
        console.error('Error streaming chat message:', error);
        throw error;
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
        throw error;
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
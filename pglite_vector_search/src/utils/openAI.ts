import { OpenAI } from 'openai';
import { setOllamaConfig, generateKeyWord as ollamaGenerateKeyWord, streamChatMessage as ollamaStreamChatMessage, generateEmbedding as ollamaGenerateEmbedding, getDimension as ollamaGetDimension } from '@/utils/ollamaAPI';

// baseURL, chatModel, embeddingModelを外部からセットできるようにする
let openai: OpenAI | null = null;
let currentBaseURL = 'http://localhost:11434';
let currentChatModel = 'gemma3:1b';
let currentEmbeddingModel = 'kun432/cl-nagoya-ruri-base:latest';

let useOllamaAPI = false;

// OpenAI APIのエンドポイントのサフィックス（本当に固定で良いのかは不明）
const openAIEndpointSuffix = '/v1';

export function setOpenAIConfig({ baseURL, chatModel, embeddingModel, useOllamaAPI: useOllama }: { baseURL: string, chatModel: string, embeddingModel: string, useOllamaAPI?: boolean }) {
    currentBaseURL = baseURL;
    currentChatModel = chatModel;
    currentEmbeddingModel = embeddingModel;
    if (useOllama !== undefined) {
        useOllamaAPI = useOllama;
    }
    openai = new OpenAI({
        baseURL: currentBaseURL + openAIEndpointSuffix,
        apiKey: 'ollama',
        dangerouslyAllowBrowser: true,
    });
    // ollamaAPIにも反映
    setOllamaConfig({
        baseURL: currentBaseURL,
        chatModel: currentChatModel,
        embeddingModel: currentEmbeddingModel
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
        ・キーワードは文章から直接抽出し、改変しないこと
        ・キーワードは2文字以上の単語であること
        ・キーワードが10個より少ない場合は、今あるキーワードの同義語や関連語を追加して10個にする
        例: "キーワード1","キーワード2","キーワード3"`;

        if (useOllamaAPI) {
            // Ollama APIを使用
            return await ollamaGenerateKeyWord(userMessage, systemPrompt);
        }

        const response = await openai.chat.completions.create({
            model: currentChatModel,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                { role: 'user', content: userMessage }
            ],
        });

        const content = response.choices?.[0]?.message?.content;
        return content || '';
    } catch (error) {
        console.error('Error generating keyword:', error);
        throw error;
    }
}

export async function* streamChatMessage(userMessage: string, memory: any[], chatHistory: any[] = []): AsyncGenerator<string> {
    try {
        if (!openai) throw new Error('OpenAIクライアントが初期化されていません');
        
        // 参考ファイル名を取得（重複を除く）
        const referenceFiles = memory.length > 0 ? 
            Array.from(new Set(memory.filter(m => m.filename).map(m => m.filename))) : [];
        
        // チャット履歴を考慮したシステムプロンプト
        let systemPrompt = '';
        if (memory.length > 0) {
            systemPrompt = `与えられた参考情報を使用してユーザの質問に答えてください。
            ・質問と直接一致する情報がない場合でも、質問の意図や類似した概念に関連する情報を探して回答してください。
            ・回答に推測や仮定を含めないでください。
            ・過去の会話履歴がある場合は、その内容を考慮して文脈に沿った適切な回答をしてください。
            ・参考情報はすでに関連性が高い順に並べられています。
            
            参考情報：\n${memory.map(m => m.content).join('\n')}`;
        } else {
            systemPrompt = 'ユーザの質問に答えてください。';
        }

        // メッセージ履歴を構築（システム→履歴→現在の質問の順）
        const messages = [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
            { role: 'user', content: userMessage }
        ];

        if (useOllamaAPI) {
            // Ollama APIを使用
            for await (const chunk of ollamaStreamChatMessage(userMessage, memory, systemPrompt, chatHistory)) {
                yield chunk;
            }
            // 回答の最後に参考ファイル名を追加
            if (referenceFiles.length > 0) {
                yield `\n\n【参考ファイル】\n${referenceFiles.join(', ')}`;
            }
            return;
        }

        const stream = await openai.chat.completions.create({
            model: currentChatModel,
            messages: messages,
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield content;
        }
        
        // 回答の最後に参考ファイル名を追加
        if (referenceFiles.length > 0) {
            yield `\n\n【参考ファイル】\n${referenceFiles.join(', ')}`;
        }
    } catch (error) {
        console.error('Error streaming chat message:', error);
        throw error;
    }
}

export async function generateEmbedding(userMessage: string): Promise<number[]> {
    try {
        if (!openai) throw new Error('OpenAIクライアントが初期化されていません');

        if (useOllamaAPI) {
            // Ollama APIを使用
            return await ollamaGenerateEmbedding(userMessage);
        }

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

        if (useOllamaAPI) {
            return await ollamaGetDimension();
        }

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
        embeddingModel: currentEmbeddingModel,
        useOllamaAPI: useOllamaAPI
    };
}
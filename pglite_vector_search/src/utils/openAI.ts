import { OpenAI } from 'openai';
import { setOllamaConfig, generateKeyWord as ollamaGenerateKeyWord, streamChatMessage as ollamaStreamChatMessage, generateEmbedding as ollamaGenerateEmbedding, getDimension as ollamaGetDimension } from '@/utils/ollamaAPI';
import {
    selectOptimalContext,
    setContextSelectionConfig,
    getContextSelectionConfig,
    adjustContextForPerformance,
    type ContextSelectionConfig,
    type SelectedContext
} from '@/utils/optimalContext';

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

export async function* streamChatMessage(userMessage: string, memory: any[], chatHistory: any[] = [], useContextSelection: boolean = false): AsyncGenerator<string> {
    try {
        if (!openai) throw new Error('OpenAIクライアントが初期化されていません');

        let selectedContext: SelectedContext[];
        let referenceFiles: string[];
        
        if (useContextSelection) {
            // 階層型コンテキスト選別を実行
            selectedContext = selectOptimalContext(memory, userMessage);

            // 参考ファイル名を取得（選別されたコンテキストから）
            referenceFiles = selectedContext.length > 0 ?
                Array.from(new Set(
                    memory.filter(m => selectedContext.some(ctx => ctx.content === m.content))
                        .map(m => m.filename)
                        .filter(f => f)
                )) : [];
        } else {
            // コンテキスト選別を行わず、全メモリをそのまま使用
            selectedContext = memory.map(m => ({
                content: m.content,
                relevanceScore: 1 - m.final_score,
                tokenCount: Math.ceil(m.content.length / 4), // 簡易的なトークン数推定
                hierarchyLevel: m.heading_level || 0 // heading_levelを使用、なければ0
            }));

            // 参考ファイル名を取得（全メモリから）
            referenceFiles = Array.from(new Set(
                memory.map(m => m.filename).filter(f => f)
            ));
        }

        // 統一されたシステムプロンプト生成（選別有無に関わらず同じ関数を使用）
        const systemPrompt: string = generateOptimizedSystemPrompt(selectedContext, userMessage);

        console.log('systemPrompt:', systemPrompt);

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

/**
 * 最適化されたシステムプロンプト生成
 * 選別されたコンテキストから効果的なシステムプロンプトを生成
 * 
 * @param selectedContext 選別されたコンテキスト
 * @param userMessage ユーザーの質問
 * @returns 最適化されたシステムプロンプト
 */
function generateOptimizedSystemPrompt(
    selectedContext: SelectedContext[],
    userMessage: string
): string {
    if (selectedContext.length === 0) {
        return 'ユーザの質問に答えてください。参考情報はありません。';
    }

    // コンテキストを関連性順に整理
    const sortedContext = selectedContext
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .map(ctx => ctx.content)
        .join('\n---\n');

    return `以下の厳選された参考情報を基に、ユーザの質問に正確に答えてください。

【重要事項】
・参考情報は関連性が高い順に整理されています
・質問に直接関連する情報を優先して使用してください
・情報が不足している場合は、その旨を明記してください
・推測や憶測は避け、根拠のある回答をしてください

【参考情報】
${sortedContext}`;
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
        useOllamaAPI: useOllamaAPI,
        contextSelection: getContextSelectionConfig()
    };
}

// 再エクスポート（optimalContext.tsの関数を外部に公開）
export {
    setContextSelectionConfig,
    getContextSelectionConfig,
    adjustContextForPerformance
} from '@/utils/optimalContext';
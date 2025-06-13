// baseURL, chatModel, embeddingModelを外部からセットできるようにする
let currentBaseURL = '';
let currentChatModel = '';
let currentEmbeddingModel = '';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatResponse {
  model: string;
  created_at: string;
  message: ChatMessage;
  done: boolean;
}

interface EmbeddingResponse {
  embedding: number[];
}

// Ollama APIのオプション
const options = {
    num_thread: 10,
}

export function setOllamaConfig({ baseURL, chatModel, embeddingModel }: { baseURL: string, chatModel: string, embeddingModel: string }) {
    currentBaseURL = baseURL;
    currentChatModel = chatModel;
    currentEmbeddingModel = embeddingModel;
}

// 初期化
setOllamaConfig({
    baseURL: currentBaseURL,
    chatModel: currentChatModel,
    embeddingModel: currentEmbeddingModel
});

export async function generateKeyWord(userMessage: string, systemPrompt: string): Promise<string> {
    try {
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        const response = await fetch(`${currentBaseURL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: currentChatModel,
                messages: messages,
                stream: false,
                options: options
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data: ChatResponse = await response.json();
        return data.message.content || '';
    } catch (error) {
        console.error('Error generating keyword:', error);
        throw error;
    }
}

export async function* streamChatMessage(userMessage: string, memory: any[], systemPrompt: string): AsyncGenerator<string> {
    try {
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        const response = await fetch(`${currentBaseURL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: currentChatModel,
                messages: messages,
                options: options,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('レスポンスボディを読み取れません');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data: ChatResponse = JSON.parse(line);
                        if (data.message?.content) {
                            yield data.message.content;
                        }
                        if (data.done) {
                            return;
                        }
                    } catch (parseError) {
                        console.warn('JSON解析エラー:', parseError);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error streaming chat message:', error);
        throw error;
    }
}

export async function generateEmbedding(userMessage: string): Promise<number[]> {
    try {
        const response = await fetch(`${currentBaseURL}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: currentEmbeddingModel,
                prompt: userMessage,
                options: options
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data: EmbeddingResponse = await response.json();
        return data.embedding || [];
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}

export async function getDimension(): Promise<number> {
    try {
        const response = await fetch(`${currentBaseURL}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: currentEmbeddingModel,
                prompt: "テスト",
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data: EmbeddingResponse = await response.json();
        const dimension = data.embedding.length;
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
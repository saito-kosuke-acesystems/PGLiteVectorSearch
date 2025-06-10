import { defineStore } from 'pinia'
import { MessageData, SendMessage, State } from '@/models/chatMessage'
import { streamChatMessage, generateEmbedding } from '@/utils/openAI'
import { insertMemory, searchMemory } from '@/utils/pglite'
import { chunkFile } from '@/utils/chunkFile'

export const useChatStore = defineStore(
    'chat',
    {
        state: (): State => ({
            messageList: new Map<number, MessageData>(),
            isLoading: false
        }),
        getters: {},
        actions: {
            // ユーザの入力したメッセージをmessageListに追加
            addMessage(question: string, isBot: boolean = false) {
                const setId = this.messageList.size + 1
                this.messageList.set(setId, {
                    id: setId,
                    message: question,
                    isBot: isBot
                })
            },
            // ボットから回答を受けメッセージを追加
            async getBotReply(question: string) {
                // 質問をベクトル化し、メモリから関連する情報を取得
                const vectorQuestion = await generateEmbedding(question)
                    .catch((reason) => {
                        errorHandler(reason)
                        return []
                    })
                const memory = await searchMemory(vectorQuestion)
                    .catch((reason) => {
                        errorHandler(reason)
                        return []
                    })
                console.log('searchMemory result:', memory)
                // 応答をストリーミング表示
                const setId = this.messageList.size + 1
                this.messageList.set(setId, {
                    id: setId,
                    message: '',
                    isBot: true
                })
                try {
                    for await (const chunk of streamChatMessage(question, memory)) {
                        const prev = this.messageList.get(setId)?.message || ''
                        this.messageList.set(setId, {
                            id: setId,
                            message: prev + chunk,
                            isBot: true
                        })
                    }
                } catch (reason) {
                    errorHandler(reason)
                } finally {
                    this.isLoading = false
                }
            },
            async uploadFile(file: File) {
                try {
                    // ファイルをチャンクに分割
                    const chunks = await chunkFile(file, 1000)
                        .catch((reason) => {
                            errorHandler(reason)
                            return []
                        })

                    // チャンク単位でベクトル化し、pgliteに保存
                    for (const chunk of chunks) {
                        console.log('Processing chunk:', chunk)
                        const vectorchunk = await generateEmbedding(chunk)
                            .catch((reason) => errorHandler(reason))
                        if (vectorchunk) {
                            await insertMemory(chunk, vectorchunk)
                                .catch((reason) => errorHandler(reason))
                        }
                    }

                    this.addMessage('ファイルのアップロードが完了しました。', true)
                } finally {
                    this.isLoading = false
                }
            }
        }
    })

const errorHandler = (error: unknown) => {
    if (error instanceof Error) {
        console.error(error.message, error.stack)
    } else {
        console.error('Error occured.', error)
    }
}
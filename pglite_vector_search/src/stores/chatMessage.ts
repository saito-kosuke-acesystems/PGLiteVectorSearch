import { defineStore } from 'pinia'
import { MessageData, SendMessage, State } from '@/models/chatMessage'
import { generateKeyWord, streamChatMessage, generateEmbedding } from '@/utils/openAI'
import { insertMemory, searchMemory, hybridSearchMemory } from '@/utils/pglite'
import { chunkFile } from '@/utils/chunkFile'
import { extractKeywords } from '@/utils/segment'

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
                // バルーン作成
                const setId = this.messageList.size + 1
                const startTime = Date.now()
                this.messageList.set(setId, {
                    id: setId,
                    message: '',
                    isBot: true,
                    isStreaming: true,
                    streamingStartTime: startTime
                })
                // 質問をセグメント化し、キーワードを抽出
                // const keywords = extractKeywords(question)
                // console.log('Extracted keywords:', keywords)
                const keywordsCSV = await generateKeyWord(question)
                console.log('Generated keywords:', keywordsCSV)
                // キーワードをカンマ区切りで分割
                const keywords = keywordsCSV.split(',').map(k => k.trim().replace(/^"|"$/g, ''))
                // 質問をベクトル化
                const vectorQuestion = await generateEmbedding(question)
                    .catch((reason) => {
                        errorHandler(reason)
                        return []
                    })
                // 参考情報を取得
                const memory = await hybridSearchMemory(keywords, vectorQuestion)
                    .catch((reason) => {
                        errorHandler(reason)
                        return []
                    })
                console.log('searchMemory result:', memory)

                // チャット履歴を構築（最新の10件のメッセージまで）
                const chatHistory: any[] = []
                const messageArray = Array.from(this.messageList.values())
                    .sort((a, b) => a.id - b.id)
                    .slice(-10) // 最新10件まで

                for (const msg of messageArray) {
                    chatHistory.push({
                        role: msg.isBot ? 'assistant' : 'user',
                        content: msg.message
                    })
                }                try {
                    // ストリーミングでチャットメッセージを取得
                    for await (const chunk of streamChatMessage(question, memory, chatHistory)) {
                        const prev = this.messageList.get(setId)?.message || ''
                        this.messageList.set(setId, {
                            id: setId,
                            message: prev + chunk,
                            isBot: true,
                            isStreaming: false,
                            streamingStartTime: undefined,
                            responseTime: (Date.now() - startTime) / 1000
                        })
                    }
                } catch (reason) {
                    errorHandler(reason)
                    // エラー時もストリーミング状態を解除
                    const currentMessage = this.messageList.get(setId)
                    if (currentMessage) {
                        this.messageList.set(setId, {
                            ...currentMessage,
                            isStreaming: false,
                            streamingStartTime: undefined,
                            responseTime: (Date.now() - startTime) / 1000
                        })
                    }
                } finally {
                    this.isLoading = false
                }
            },            async uploadFile(file: File) {                // アップロード用のメッセージバルーンを作成
                const setId = this.messageList.size + 1
                const startTime = Date.now()
                this.messageList.set(setId, {
                    id: setId,
                    message: '',
                    isBot: true,
                    isStreaming: true,
                    streamingStartTime: startTime,
                    isFileUpload: true
                })
                
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
                    }                    // 完了メッセージに更新
                    this.messageList.set(setId, {
                        id: setId,
                        message: 'ファイルのアップロードが完了しました。',
                        isBot: true,
                        isStreaming: false,
                        streamingStartTime: undefined,
                        responseTime: (Date.now() - startTime) / 1000,
                        isFileUpload: true
                    })
                } catch (reason) {
                    errorHandler(reason)
                    // エラー時もストリーミング状態を解除
                    const currentMessage = this.messageList.get(setId)
                    if (currentMessage) {
                        this.messageList.set(setId, {
                            ...currentMessage,
                            message: 'ファイルのアップロードに失敗しました。',
                            isStreaming: false,
                            streamingStartTime: undefined,
                            responseTime: (Date.now() - startTime) / 1000,
                            isFileUpload: true
                        })
                    }
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
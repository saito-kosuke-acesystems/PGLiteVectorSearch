import { defineStore } from 'pinia'
import { MessageData, SendMessage, State } from '@/models/chatMessage'
import { generateChatMessage, generateEmbedding } from '@/utils/openAI'
import { insertMemory, searchMemory } from '@/utils/pglite'

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

                // 回答の生成
                await generateChatMessage(question, memory)
                    .then((response) => {
                        const setId = this.messageList.size + 1
                        this.messageList.set(setId, {
                            id: setId,
                            message: response,
                            isBot: true
                        })
                    })
                    .catch((reason) => errorHandler(reason))
                    .finally(() => {
                        this.isLoading = false
                    })
            },
            async uploadFile(file: File) {
                try {
                    // 拡張子別にファイルを処理
                    const ext = file.name.split('.').pop()?.toLowerCase()
                    let text
                    switch (ext) {
                        case 'txt':
                            text = await file.text()
                            break
                        default:
                            this.addMessage('対応していないファイル形式です。', true)
                            this.isLoading = false
                            return
                    }
                    
                    // テキストの分割
                    const chunkSize = 1000 // とりあえず1000文字ぐらいで様子見
                    const chunks = text.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || []

                    // チャンクをベクトル化し、pgliteに保存
                    for (const chunk of chunks) {
                        const vectorchunk = await generateEmbedding(chunk)
                            .catch((reason) => errorHandler(reason))
                        if (vectorchunk) {
                            await insertMemory(text, vectorchunk)
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
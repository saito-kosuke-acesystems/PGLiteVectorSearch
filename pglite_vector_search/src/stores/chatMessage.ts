import { defineStore } from 'pinia'
import { MessageData, SendMessage, State } from '@/models/chatMessage'
import { generateChatMessage, generateEmbedding } from '@/utils/openAI'
import { insertMemory } from '@/utils/pglite'

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
                // バックエンド連携
                const sendMessage: SendMessage = {
                    message: question
                }
                await generateChatMessage(question)
                    .then((response) => {
                        // 回答構成
                        const setId = this.messageList.size + 1
                        this.messageList.set(setId, {
                            id: setId,
                            message: response,
                            isBot: true
                        })
                    })
                    .catch((reason) => {
                        if (reason instanceof Error) {
                            console.error(reason.message, reason.stack)
                            window.alert(reason.message)
                        } else {
                            console.error('Error occured.', reason)
                            window.alert('エラー発生')
                        }
                    })
                    .finally(() => {
                        this.isLoading = false
                    })
            },
            async uploadFile(file: File) {
                // 拡張子を確認
                const ext = file.name.split('.').pop()?.toLowerCase()
                if (!ext || (ext !== 'txt')) {
                    this.addMessage('TXTファイルをアップロードしてください。', true)
                    this.isLoading = false
                    return
                }
                // テキストファイルをベクトル化
                const text = await file.text()
                const vectorText = await generateEmbedding(text)
                    .catch((reason) => {
                        if (reason instanceof Error) {
                            console.error(reason.message, reason.stack)
                            window.alert(reason.message)
                        } else {
                            console.error('Error occured.', reason)
                            window.alert('エラー発生')
                        }
                    })

                // ベクトル化結果をpgliteに保存
                if (vectorText) {
                    await insertMemory(text, vectorText)
                        .then(() => {
                            this.addMessage('ファイルをアップロードしました。', true)
                        })
                        .catch((reason) => {
                            if (reason instanceof Error) {
                                console.error(reason.message, reason.stack)
                                window.alert(reason.message)
                            } else {
                                console.error('Error occured.', reason)
                                window.alert('エラー発生')
                            }
                        })
                } else {
                    this.addMessage('ファイルのアップロードに失敗しました。', true)
                }
                this.isLoading = false
            }
        }
    })
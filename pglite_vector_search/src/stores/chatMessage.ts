import { defineStore } from 'pinia'
import { MessageData, SendMessage, State } from '@/models/chatMessage'
import { generateChatMessage, generateEmbedding } from '@/utils/openAI'

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
            addUserMessage(question: string) {
                const setId = this.messageList.size + 1
                this.messageList.set(setId, {
                    id: setId,
                    message: question,
                    isBot: false
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
            }
        }
    })
import { defineStore } from 'pinia'
import { MessageData, SendMessage, State } from '@/models/chatMessage'

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
                const backendUrl = '<バックエンドAPIのURL>'
                const sendMessage: SendMessage = {
                    message: question
                }

                await fetch(backendUrl, {
                    method: 'POST',
                    mode: 'cors',
                    cache: 'no-cache',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: JSON.stringify(sendMessage)
                })
                    .then((response) => {
                        response
                            .json()
                            .then((value) => {
                                const replyData = value[0]
                                // 回答構成
                                const setId = this.messageList.size + 1
                                this.messageList.set(setId, {
                                    id: setId,
                                    message: replyData.reply,
                                    isBot: true
                                })
                            })
                            .catch((reason) => {
                                console.error('Error at reply object construction.', reason)
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
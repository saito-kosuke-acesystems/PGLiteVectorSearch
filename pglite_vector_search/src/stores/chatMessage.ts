import { defineStore } from 'pinia'
import { MessageData, SendMessage, State } from '@/models/chatMessage'
import { generateKeyWord, streamChatMessage, generateEmbedding } from '@/utils/openAI'
import {
    insertMemory,
    searchMemory,
    hybridSearchMemory,
    adaptiveVectorSearch,
    enhancedVectorSearch,
    processFileWithImprovedChunking,
    insertMemoryBatch
} from '@/utils/pglite'
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
                // 質問をセグメント化し、キーワードを作成
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
                // 適応的検索を使用して参考情報を取得（改善版を優先使用）
                let memory: any[] = []
                try {
                    // 改善されたベクトル検索を優先使用
                    console.log('Using enhanced vector search...')
                    memory = await enhancedVectorSearch(vectorQuestion, {
                        limit: 5,
                        keywords: keywords.filter(k => k.length > 0),
                        minRelevanceScore: 0.3,
                        includeContext: true,
                        deduplicateOverlaps: true,
                        weightings: {
                            vector: 0.5,    // ベクトル類似度の重み
                            keyword: 0.4,   // キーワードマッチの重み
                            context: 0.1    // コンテキストサイズの重み
                        }
                    })

                    console.log('Enhanced search successful:', memory.length, 'results')
                } catch (enhancedError: any) {
                    console.log('Enhanced search failed, falling back to adaptive search:', enhancedError.message)
                    try {
                        // フォールバック1: 適応的検索
                        memory = await adaptiveVectorSearch(vectorQuestion, keywords, question, 5)
                    } catch (adaptiveError: any) {
                        console.log('Adaptive search failed, falling back to hybrid search:', adaptiveError.message)
                        try {
                            // フォールバック2: 従来のハイブリッド検索
                            memory = await hybridSearchMemory(keywords, vectorQuestion, 3)
                        } catch (hybridError: any) {
                            console.log('All search methods failed, using basic vector search')
                            // フォールバック3: 基本的なベクトル検索
                            try {
                                memory = await searchMemory(vectorQuestion, 3)
                            } catch (basicError: any) {
                                errorHandler(basicError)
                                memory = []
                            }
                        }
                    }
                } console.log('Search results:', memory.length, 'documents found')
                console.log('Memory contents:', memory.map(m => ({
                    section: (m as any)?.section,
                    content: (m as any)?.content?.substring(0, 100) + '...',
                    distance: (m as any)?.distance || (m as any)?.vector_distance,
                    relevanceScore: (m as any)?.relevance_score,
                    hasKeywordInSection: (m as any)?.hasKeywordInSection,
                    combinedScore: (m as any)?.combinedScore
                })))

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
                } try {
                    // 質問・参考情報・チャット履歴を元に回答を作成
                    for await (const chunk of streamChatMessage(question, memory, chatHistory)) {
                        // 応答をストリーミング出力
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
            },            // 参考情報のアップロード（改善されたチャンキング使用）
            async uploadFile(file: File) {
                // アップロード用のメッセージバルーンを作成
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
                    console.log('Starting improved file processing for:', file.name)

                    // 改善されたファイル処理を使用
                    const processingResult = await processFileWithImprovedChunking(
                        file,
                        async (text: string) => {
                            return await generateEmbedding(text)
                                .catch((reason) => {
                                    errorHandler(reason)
                                    return []
                                })
                        },
                        {
                            maxChunkSize: 800,      // 少し小さめのチャンクサイズ
                            overlapSize: 160,       // 20%のオーバーラップ
                            useSemanticSplit: true, // セマンティック分割を使用
                            batchSize: 15           // バッチサイズ
                        }
                    )

                    console.log('File processing completed:', processingResult)

                    // 処理結果に基づいた詳細な完了メッセージ
                    const processingTime = (processingResult.totalProcessingTime / 1000).toFixed(2)
                    const completionMessage = `
ファイルのアップロードが完了しました。

📊 処理結果:
• 総チャンク数: ${processingResult.totalChunks}個
• 処理時間: ${processingTime}秒
• 平均チャンクサイズ: ${processingResult.chunkStats.averageSize}文字
• オーバーラップ付きチャンク: ${processingResult.chunkStats.withOverlap}個
• チャンクサイズ範囲: ${processingResult.chunkStats.minSize}〜${processingResult.chunkStats.maxSize}文字

✨ セマンティックチャンキングとオーバーラップにより、より高精度な検索が可能になりました。
                    `.trim()

                    this.messageList.set(setId, {
                        id: setId,
                        message: completionMessage,
                        isBot: true,
                        isStreaming: false,
                        streamingStartTime: undefined,
                        responseTime: (Date.now() - startTime) / 1000,
                        isFileUpload: true
                    })

                } catch (reason) {
                    console.log('Improved file processing failed, falling back to legacy method')
                    errorHandler(reason)

                    try {
                        // フォールバック: 従来の方法でファイル処理
                        console.log('Using legacy chunking method...')
                        const chunks = await chunkFile(file, 500)
                            .catch((reason) => {
                                errorHandler(reason)
                                return []
                            })

                        if (chunks.length === 0) {
                            throw new Error('No chunks generated from file')
                        }

                        // セクションごとの連番を管理するMap
                        const sectionSequenceMap = new Map<string, number>()

                        // チャンク単位でベクトル化し、pgliteに保存
                        for (const chunk of chunks) {
                            console.log('Processing chunk:', chunk.content.substring(0, 100) + '...')
                            const vectorchunk = await generateEmbedding(chunk.content)
                                .catch((reason) => {
                                    errorHandler(reason)
                                    return null
                                })

                            if (vectorchunk && vectorchunk.length > 0) {
                                // セクションの連番を取得または初期化
                                const sectionKey = `${chunk.filename || 'unknown'}_${chunk.section || 'unknown'}`
                                const sectionSequence = sectionSequenceMap.get(sectionKey) || 0

                                await insertMemory(chunk.content, vectorchunk, chunk.filename, chunk.section, sectionSequence)
                                    .catch((reason) => errorHandler(reason))

                                // 次回用に連番をインクリメント
                                sectionSequenceMap.set(sectionKey, sectionSequence + 1)
                            }
                        }

                        // 完了メッセージに更新（レガシー方式）
                        this.messageList.set(setId, {
                            id: setId,
                            message: `ファイルのアップロードが完了しました。\n\n📊 処理結果:\n• 総チャンク数: ${chunks.length}個\n• 処理方式: レガシーチャンキング\n\n⚠️ 改善されたチャンキング機能でエラーが発生したため、従来の方式で処理されました。`,
                            isBot: true,
                            isStreaming: false,
                            streamingStartTime: undefined,
                            responseTime: (Date.now() - startTime) / 1000,
                            isFileUpload: true
                        })

                    } catch (legacyError) {
                        errorHandler(legacyError)
                        // エラー時もストリーミング状態を解除
                        const currentMessage = this.messageList.get(setId)
                        if (currentMessage) {
                            this.messageList.set(setId, {
                                ...currentMessage,
                                message: `ファイルのアップロードに失敗しました。\n\nエラー詳細:\n${reason instanceof Error ? reason.message : String(reason)}`,
                                isStreaming: false,
                                streamingStartTime: undefined,
                                responseTime: (Date.now() - startTime) / 1000,
                                isFileUpload: true
                            })
                        }
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
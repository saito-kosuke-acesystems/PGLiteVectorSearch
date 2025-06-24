// 階層型コンテキスト選別システム
// 大量のメモリ情報から最適なコンテキストを選別し、回答品質を保ちながら処理速度を向上させる

// コンテキスト選別設定
export interface ContextSelectionConfig {
    maxTokens: number;           // 最大トークン数
    priorityThreshold: number;   // 優先度閾値
    diversityWeight: number;     // 多様性重み
    hierarchyWeight: number;     // 階層重み
}

// コンテキスト選別結果
export interface SelectedContext {
    content: string;
    relevanceScore: number;
    hierarchyLevel: number;
    tokenCount: number;
}

// デフォルト設定
let defaultContextConfig: ContextSelectionConfig = {
    maxTokens: 2000,        // 従来の約半分に削減
    priorityThreshold: 0.7, // 関連性の最低閾値
    diversityWeight: 0.3,   // 多様性を30%考慮
    hierarchyWeight: 0.4    // 階層を40%考慮
};

/**
 * トークン数推定関数（日本語・英語混在対応）
 * @param text 推定対象のテキスト
 * @returns 推定トークン数
 */
export function estimateTokenCount(text: string): number {
    // 日本語文字は1.5トークン、英語単語は1トークンと仮定
    const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = text.length - japaneseChars - englishWords;

    return Math.ceil(japaneseChars * 1.5 + englishWords + otherChars * 0.5);
}

/**
 * 階層型コンテキスト選別関数
 * ベクトル距離、階層情報、多様性を考慮して最適なコンテキストを選別
 * 
 * @param memory 検索結果のメモリ配列
 * @param userMessage ユーザーの質問
 * @param config 選別設定（オプション）
 * @returns 選別されたコンテキスト配列
 */
export function selectOptimalContext(
    memory: any[],
    userMessage: string,
    config: ContextSelectionConfig = defaultContextConfig
): SelectedContext[] {
    if (memory.length === 0) return [];

    // 1. 基本スコア計算（ベクトル距離ベース）
    const scoredMemories = memory.map((item, index) => ({
        ...item,
        baseScore: 1 - (item.base_distance || item.final_score || 0.5), // 距離を類似度に変換
        originalIndex: index
    }));

    // 2. 階層重み付けスコア計算
    const hierarchyScored = scoredMemories.map(item => {
        const hierarchyBonus = item.heading_level ?
            Math.max(0, (7 - item.heading_level) / 6 * config.hierarchyWeight) : 0;

        const overlapBonus = item.has_overlap ? 0.1 : 0;
        const chunkBonus = item.chunk_part_number === 1 ? 0.15 : 0;

        return {
            ...item,
            finalScore: item.baseScore + hierarchyBonus + overlapBonus + chunkBonus
        };
    });

    // 3. 多様性を考慮した選別
    const selected: any[] = [];
    let totalTokens = 0;
    const usedSections = new Set<string>();

    // スコア順にソート
    hierarchyScored.sort((a, b) => b.finalScore - a.finalScore);

    for (const item of hierarchyScored) {
        const tokenCount = estimateTokenCount(item.content);

        // トークン制限チェック
        if (totalTokens + tokenCount > config.maxTokens) {
            continue;
        }

        // スコア閾値チェック
        if (item.finalScore < config.priorityThreshold) {
            continue;
        }

        // 多様性チェック（同じセクションからの重複を避ける）
        const sectionKey = `${item.filename}-${item.heading_text || 'default'}`;
        if (usedSections.has(sectionKey) && Math.random() > config.diversityWeight) {
            continue;
        }

        selected.push(item);
        totalTokens += tokenCount;
        usedSections.add(sectionKey);

        // 最大5件まで
        if (selected.length >= 5) {
            break;
        }
    }

    // 4. 最終的なコンテキスト生成
    return selected.map(item => ({
        content: item.content,
        relevanceScore: item.finalScore,
        hierarchyLevel: item.heading_level || 0,
        tokenCount: estimateTokenCount(item.content)    }));
}

/**
 * コンテキスト選別設定のカスタマイズ関数
 * @param config 部分的な設定オブジェクト
 */
export function setContextSelectionConfig(config: Partial<ContextSelectionConfig>): void {
    defaultContextConfig = { ...defaultContextConfig, ...config };
}

/**
 * 現在のコンテキスト設定を取得
 * @returns 現在の設定のコピー
 */
export function getContextSelectionConfig(): ContextSelectionConfig {
    return { ...defaultContextConfig };
}

/**
 * 動的コンテキスト調整（ネットワーク速度やデバイス性能に応じて）
 * @param performanceLevel パフォーマンスレベル
 */
export function adjustContextForPerformance(performanceLevel: 'low' | 'medium' | 'high'): void {
    const configs = {
        low: {
            maxTokens: 1000,
            priorityThreshold: 0.8,
            diversityWeight: 0.2,
            hierarchyWeight: 0.5
        },
        medium: {
            maxTokens: 2000,
            priorityThreshold: 0.7,
            diversityWeight: 0.3,
            hierarchyWeight: 0.4
        },
        high: {
            maxTokens: 4000,
            priorityThreshold: 0.6,
            diversityWeight: 0.4,
            hierarchyWeight: 0.3
        }
    };

    setContextSelectionConfig(configs[performanceLevel]);
}

/**
 * コンテキスト選別の統計情報を取得
 * @param original 元のメモリ配列
 * @param selected 選別されたコンテキスト
 * @returns 統計情報オブジェクト
 */
export function getSelectionStats(original: any[], selected: SelectedContext[]) {
    const totalOriginalTokens = original.reduce((sum, item) =>
        sum + estimateTokenCount(item.content), 0);
    const totalSelectedTokens = selected.reduce((sum, ctx) =>
        sum + ctx.tokenCount, 0);

    return {
        originalCount: original.length,
        selectedCount: selected.length,
        reductionRatio: original.length > 0 ? (original.length - selected.length) / original.length : 0,
        originalTokens: totalOriginalTokens,
        selectedTokens: totalSelectedTokens,
        tokenReductionRatio: totalOriginalTokens > 0 ?
            (totalOriginalTokens - totalSelectedTokens) / totalOriginalTokens : 0,
        averageRelevanceScore: selected.length > 0 ?
            selected.reduce((sum, ctx) => sum + ctx.relevanceScore, 0) / selected.length : 0
    };
}

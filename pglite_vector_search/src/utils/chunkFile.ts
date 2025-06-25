// セクションの型定義
interface SectionWithMetadata {
    heading: string;
    content: string;
    headingLevel?: number;
    headingPath?: string[];
    headingText?: string;
    chunkPartNumber?: number;
    totalChunkParts?: number;
    hasOverlap?: boolean;
}

// 見出し階層を管理する構造
interface HeadingHierarchy {
    level: number;
    text: string;
    path: string[];
}

// オーバーラップ付きチャンクの設定
interface ChunkConfig {
    size: number; // トークン数での制限
    overlapRatio: number; // オーバーラップの割合（0.1 = 10%）
}

// チャンク結果の型定義
export interface ChunkResult {
    section: string;
    content: string;
    filename: string;
    headingLevel?: number;
    headingPath?: string[];
    headingText?: string;
    chunkPartNumber?: number;
    totalChunkParts?: number;
    hasOverlap?: boolean;
}

export async function chunkFile(file: File, chunkSize: number = 512): Promise<ChunkResult[]> {
    // chunkSizeはトークン数として扱う    
    // 拡張子別にファイルを処理
    const ext = file.name.split('.').pop()?.toLowerCase()
    let text: string; let sections: SectionWithMetadata[] = [];
    switch (ext) {
        case 'txt':
            text = await file.text();
            sections = await chunkTxt(text, chunkSize);
            break;
        case 'md':
            text = await file.text();
            sections = await chunkMd(text, chunkSize);
            break
        default:
            // 例外をスロー
            throw new Error('対応していないファイル形式です。: ' + ext);
    }
    // セクションとファイル名のペアを返す
    return sections.map(section => ({
        section: section.heading,
        content: section.content,
        filename: file.name,
        headingLevel: section.headingLevel,
        headingPath: section.headingPath,
        headingText: section.headingText,
        chunkPartNumber: section.chunkPartNumber,
        totalChunkParts: section.totalChunkParts,
        hasOverlap: section.hasOverlap
    }));
}

async function chunkTxt(text: string, chunkSize: number): Promise<SectionWithMetadata[]> {
    const config: ChunkConfig = {
        size: chunkSize,
        overlapRatio: 0.15 // 15%のオーバーラップ
    };

    // txtファイルを単一の階層構造として扱う
    const hierarchicalSections = [{
        hierarchy: {
            level: 1,
            text: '無題',
            path: ['無題']
        },
        content: text.trim()
    }];

    // 階層構造を考慮してチャンクに分割（文境界優先）
    return createHierarchicalChunksWithSentenceBoundary(hierarchicalSections, config);
}

async function chunkMd(text: string, chunkSize: number): Promise<SectionWithMetadata[]> {

    const config: ChunkConfig = {
        size: chunkSize,
        overlapRatio: 0.15 // 15%のオーバーラップ
    };

    // Markdownテキストを階層構造で解析
    const hierarchicalSections = parseMarkdownHierarchy(text);

    // 見出しが全くない場合の対応
    if (hierarchicalSections.length === 0 && text.trim()) {
        hierarchicalSections.push({
            hierarchy: {
                level: 1,
                text: '無題',
                path: ['無題']
            },
            content: text.trim()
        });
    }

    // 階層構造を考慮してチャンクに分割（文境界優先）
    return createHierarchicalChunksWithSentenceBoundary(hierarchicalSections, config);
}

// Markdownテキストを階層構造で解析する関数
function parseMarkdownHierarchy(text: string): { hierarchy: HeadingHierarchy, content: string }[] {
    const lines = text.split(/\r?\n/);
    const sections: { hierarchy: HeadingHierarchy, content: string }[] = [];
    const hierarchyStack: string[] = []; // 現在の階層パスを保持

    let currentContent: string[] = [];
    let currentHierarchy: HeadingHierarchy | null = null; for (const line of lines) {
        // 見出し行の検出（# ## ### ####など）
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
            // 前のセクションを保存
            if (currentHierarchy && currentContent.length > 0) {
                sections.push({
                    hierarchy: currentHierarchy,
                    content: currentContent.join('\n').trim()
                });
            }

            const level = headingMatch[1].length;
            const headingText = headingMatch[2].trim();

            // 階層スタックを更新
            hierarchyStack.splice(level - 1);
            // 現在のレベル以下をクリア
            hierarchyStack[level - 1] = headingText;

            // 現在の階層パスを作成
            const path = [...hierarchyStack.slice(0, level)];

            currentHierarchy = {
                level,
                text: headingText,
                path
            };
            // 見出し行自体をコンテンツの先頭に含める
            currentContent = [line];
        } else {
            // コンテンツ行
            // 見出しが設定されていない状態で初めてコンテンツが見つかった場合、デフォルト見出しを設定
            if (!currentHierarchy && line.trim()) {
                hierarchyStack[0] = '無題';
                currentHierarchy = {
                    level: 1,
                    text: '無題',
                    path: ['無題']
                };
            }
            currentContent.push(line);
        }
    }

    // 最後のセクションを保存
    if (currentHierarchy && currentContent.length > 0) {
        sections.push({
            hierarchy: currentHierarchy,
            content: currentContent.join('\n').trim()
        });
    }

    // md内に見出しが全くない場合の対応
    if (!currentHierarchy && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
            sections.push({
                hierarchy: {
                    level: 1,
                    text: '無題',
                    path: ['無題']
                },
                content
            });
        }
    }

    return sections;
}

// 階層構造を考慮してチャンクを生成する関数（トークンベース、文境界優先版）
function createHierarchicalChunksWithSentenceBoundary(
    hierarchicalSections: { hierarchy: HeadingHierarchy, content: string }[],
    config: ChunkConfig
): SectionWithMetadata[] {
    const chunks: SectionWithMetadata[] = [];
    const overlapTokens = Math.floor(config.size * config.overlapRatio);

    for (let i = 0; i < hierarchicalSections.length; i++) {
        const section = hierarchicalSections[i];
        const fullHeading = section.hierarchy.path.map((h, idx) => '#'.repeat(idx + 1) + ' ' + h).join(' > ');

        // コンテンツのトークン数を計算
        const contentTokens = estimateTokenCount(section.content);

        // コンテンツが短い場合はそのまま
        if (contentTokens <= config.size) {
            let content = section.content;

            // オーバーラップを追加
            content = addOverlapContextTokenBased(
                content,
                hierarchicalSections,
                i,
                overlapTokens
            );

            chunks.push({
                heading: fullHeading,
                content: content,
                // 階層情報を追加
                headingLevel: section.hierarchy.level,
                headingPath: section.hierarchy.path,
                headingText: section.hierarchy.text,
                chunkPartNumber: 1,
                totalChunkParts: 1,
                hasOverlap: content !== section.content // オーバーラップが追加されたかどうか
            });
        } else {
            // 長いコンテンツはトークンベースで文境界優先分割
            const splitChunks = splitContentByTokensWithSentenceBoundary(
                fullHeading,
                section.content,
                config.size,
                overlapTokens,
                section.hierarchy // 階層情報を渡す
            );
            chunks.push(...splitChunks);
        }
    }

    return chunks;
}

// トークンベースで文境界を優先したコンテンツ分割関数
function splitContentByTokensWithSentenceBoundary(
    heading: string,
    content: string,
    chunkTokenSize: number,
    overlapTokens: number,
    hierarchy?: HeadingHierarchy
): SectionWithMetadata[] {
    const sections: SectionWithMetadata[] = [];

    // 段落で分割（改行2つ以上で区切られた部分）
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());

    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
        // 段落内の文を分割（。！？で区切る）
        const sentences = splitIntoSentences(paragraph);

        for (const sentence of sentences) {
            const potentialChunk = currentChunk ? `${currentChunk}\n\n${sentence}` : sentence;
            const potentialTokens = estimateTokenCount(potentialChunk);

            // トークン制限を超える場合
            if (potentialTokens > chunkTokenSize - overlapTokens) {
                // 現在のチャンクを保存
                if (currentChunk.trim()) {
                    sections.push({
                        heading: sections.length > 0 ? `${heading} (Part ${chunkIndex + 1})` : heading,
                        content: addSentenceOverlapTokenBased(currentChunk.trim(), sections, overlapTokens),
                        // 階層情報を追加
                        headingLevel: hierarchy?.level,
                        headingPath: hierarchy?.path,
                        headingText: hierarchy?.text,
                        chunkPartNumber: chunkIndex + 1,
                        totalChunkParts: 0, // 後で更新
                        hasOverlap: true
                    });
                    chunkIndex++;
                }

                // 文が単体でトークン制限を超える場合
                const sentenceTokens = estimateTokenCount(sentence);
                if (sentenceTokens > chunkTokenSize - overlapTokens) {
                    // 文の途中で切れる場合は上限を超えても許可
                    sections.push({
                        heading: `${heading} (Part ${chunkIndex + 1})`,
                        content: sentence,
                        // 階層情報を追加
                        headingLevel: hierarchy?.level,
                        headingPath: hierarchy?.path,
                        headingText: hierarchy?.text,
                        chunkPartNumber: chunkIndex + 1,
                        totalChunkParts: 0, // 後で更新
                        hasOverlap: false
                    });
                    chunkIndex++;
                    currentChunk = '';
                } else {
                    currentChunk = sentence;
                }
            } else {
                currentChunk = potentialChunk;
            }
        }
    }

    // 最後のチャンクを保存
    if (currentChunk.trim()) {
        sections.push({
            heading: sections.length > 0 ? `${heading} (Part ${chunkIndex + 1})` : heading,
            content: addSentenceOverlapTokenBased(currentChunk.trim(), sections, overlapTokens),
            // 階層情報を追加
            headingLevel: hierarchy?.level,
            headingPath: hierarchy?.path,
            headingText: hierarchy?.text,
            chunkPartNumber: chunkIndex + 1,
            totalChunkParts: 0, // 後で更新
            hasOverlap: true
        });
    }

    // totalChunkPartsを更新
    const totalParts = sections.length;
    sections.forEach(section => {
        section.totalChunkParts = totalParts;
    });

    return sections;
}

// 文への分割（日本語・英語対応）
function splitIntoSentences(text: string): string[] {
    // 日本語の句読点と英語のピリオドで分割
    const sentences = text.split(/(?<=[。！？.!?])\s*/).filter(s => s.trim());

    // 分割結果が空の場合は元のテキストを返す
    if (sentences.length === 0) {
        return [text];
    }

    return sentences;
}

// トークンベースでの文レベルオーバーラップ追加
function addSentenceOverlapTokenBased(content: string, previousSections: SectionWithMetadata[], overlapTokens: number): string {
    if (previousSections.length === 0 || overlapTokens <= 0) {
        return content;
    }

    // 前のチャンクの最後の部分を取得
    const prevContent = previousSections[previousSections.length - 1].content;
    const sentences = splitIntoSentences(prevContent);

    // 前のチャンクからトークン制限内でオーバーラップを追加
    let overlap = '';
    let currentTokens = 0;

    for (let i = sentences.length - 1; i >= 0; i--) {
        const sentence = sentences[i];
        const sentenceTokens = estimateTokenCount(sentence);

        if (currentTokens + sentenceTokens <= overlapTokens) {
            overlap = sentence + overlap;
            currentTokens += sentenceTokens;
        } else {
            break;
        }
    }

    if (overlap.trim()) {
        return `...${overlap}\n\n${content}`;
    }

    return content;
}

// トークンベースでのオーバーラップコンテキスト追加
function addOverlapContextTokenBased(
    content: string,
    allSections: { hierarchy: HeadingHierarchy, content: string }[],
    currentIndex: number,
    overlapTokens: number
): string {
    let result = content;

    // 前のセクションからコンテキストを追加
    if (currentIndex > 0 && overlapTokens > 0) {
        const prevContent = allSections[currentIndex - 1].content;
        let prevOverlap = '';
        let tokenCount = 0;

        // 文単位で後ろから追加
        const sentences = splitIntoSentences(prevContent);
        for (let i = sentences.length - 1; i >= 0; i--) {
            const sentence = sentences[i];
            const sentenceTokens = estimateTokenCount(sentence);

            if (tokenCount + sentenceTokens <= overlapTokens) {
                prevOverlap = sentence + prevOverlap;
                tokenCount += sentenceTokens;
            } else {
                break;
            }
        }

        if (prevOverlap.trim()) {
            result = `...${prevOverlap}\n\n${result}`;
        }
    }

    // 次のセクションからコンテキストを追加
    if (currentIndex < allSections.length - 1 && overlapTokens > 0) {
        const nextContent = allSections[currentIndex + 1].content;
        let nextOverlap = '';
        let tokenCount = 0;

        // 文単位で前から追加
        const sentences = splitIntoSentences(nextContent);
        for (const sentence of sentences) {
            const sentenceTokens = estimateTokenCount(sentence);

            if (tokenCount + sentenceTokens <= overlapTokens) {
                nextOverlap += sentence;
                tokenCount += sentenceTokens;
            } else {
                break;
            }
        }

        if (nextOverlap.trim()) {
            result = `${result}\n\n${nextOverlap}...`;
        }
    }

    return result;
}

// トークン計算用のユーティリティ関数
/**
 * 文字数からトークン数を推定する関数（簡易版）
 * 日本語: 1文字 ≈ 1トークン
 * 英語: 1単語 ≈ 1トークン、平均4-5文字
 * 記号・数字: 文字数ベース
 */
function estimateTokenCount(text: string): number {
    if (!text || text.trim() === '') return 0;

    // 日本語文字（ひらがな、カタカナ、漢字）の数をカウント
    const japaneseChars = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || [];

    // 英数字・記号を含む部分（日本語以外）
    const nonJapaneseText = text.replace(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');

    // 英単語の数を推定（空白区切りで分割）
    const englishWords = nonJapaneseText.trim() ? nonJapaneseText.trim().split(/\s+/).length : 0;

    // 記号・数字（英単語以外の文字）
    const symbolsAndNumbers = nonJapaneseText.replace(/\s+/g, '').length - englishWords * 4; // 平均英単語長を4として差し引き

    // トークン数を計算
    const japaneseTokens = japaneseChars.length;
    const englishTokens = englishWords;
    const symbolTokens = Math.max(0, Math.ceil(symbolsAndNumbers / 2)); // 記号は2文字で1トークン程度

    return japaneseTokens + englishTokens + symbolTokens;
}

/**
 * トークン数からおおよその文字数を推定する関数
 * チャンクサイズの初期推定に使用
 */
function estimateCharCountFromTokens(tokenCount: number): number {
    // 日本語中心のテキストを想定し、1トークン ≈ 1.2文字として推定
    return Math.floor(tokenCount * 1.2);
}


// セクションの型定義
interface Section {
    heading: string;
    content: string;
}

// セクションの型定義（拡張版）
interface SectionWithMetadata extends Section {
    // chunkMd関連の階層情報
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
    size: number;
    overlapRatio: number; // オーバーラップの割合（0.1 = 10%）
}

// チャンク結果の型定義
export interface ChunkResult {
    section: string;
    content: string;
    filename: string;
    // chunkMd関連の階層情報
    headingLevel?: number;
    headingPath?: string[];
    headingText?: string;
    chunkPartNumber?: number;
    totalChunkParts?: number;
    hasOverlap?: boolean;
}

export async function chunkFile(file: File, chunkSize: number = 1000): Promise<ChunkResult[]> {    // 拡張子別にファイルを処理
    const ext = file.name.split('.').pop()?.toLowerCase()
    let text: string;
    let sections: (Section | SectionWithMetadata)[] = [];
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
        // SectionWithMetadataの場合は階層情報も含める
        headingLevel: 'headingLevel' in section ? section.headingLevel : undefined,
        headingPath: 'headingPath' in section ? section.headingPath : undefined,
        headingText: 'headingText' in section ? section.headingText : undefined,
        chunkPartNumber: 'chunkPartNumber' in section ? section.chunkPartNumber : undefined,
        totalChunkParts: 'totalChunkParts' in section ? section.totalChunkParts : undefined,
        hasOverlap: 'hasOverlap' in section ? section.hasOverlap : undefined
    }));
}

async function chunkTxt(text: string, chunkSize: number): Promise<Section[]> {
    // splitLongContentを使用してテキストを分割
    return splitLongContent('# 無題', text, chunkSize);
}

async function chunkMd(text: string, chunkSize: number): Promise<SectionWithMetadata[]> {
    // 500文字制限を適用
    const maxChunkSize = Math.min(chunkSize, 500);

    const config: ChunkConfig = {
        size: maxChunkSize,
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

// 長いコンテンツを指定されたサイズで分割する関数
function splitLongContent(heading: string, content: string, chunkSize: number): Section[] {
    if (content.length <= chunkSize) {
        return [{
            heading: heading,
            content: content
        }];
    }

    const sections: Section[] = [];
    const lines = content.split('\n');
    let currentChunk = '';

    for (const line of lines) {
        if (currentChunk.length + line.length + 1 > chunkSize) {
            // 現在のチャンクがchunkSizeを超える場合、チャンクを保存
            if (currentChunk.trim()) {
                sections.push({
                    heading: heading,
                    content: currentChunk.trim()
                });
            }
            currentChunk = line; // 新しいチャンクを開始
        } else {
            // 現在のチャンクに行を追加
            currentChunk += (currentChunk ? '\n' : '') + line;
        }
    }

    // 最後のチャンクを保存
    if (currentChunk.trim()) {
        sections.push({
            heading: heading,
            content: currentChunk.trim()
        });
    }

    return sections;
}

// Markdownテキストを階層構造で解析する関数
function parseMarkdownHierarchy(text: string): { hierarchy: HeadingHierarchy, content: string }[] {
    const lines = text.split(/\r?\n/);
    const sections: { hierarchy: HeadingHierarchy, content: string }[] = [];
    const hierarchyStack: string[] = []; // 現在の階層パスを保持

    let currentContent: string[] = [];
    let currentHierarchy: HeadingHierarchy | null = null;    for (const line of lines) {
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
            hierarchyStack.splice(level - 1); // 現在のレベル以下をクリア
            hierarchyStack[level - 1] = headingText;

            // 現在の階層パスを作成
            const path = [...hierarchyStack.slice(0, level)];

            currentHierarchy = {
                level,
                text: headingText,
                path
            };
            currentContent = [];
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

// 階層構造を考慮してチャンクを生成する関数（文境界優先版）
function createHierarchicalChunksWithSentenceBoundary(
    hierarchicalSections: { hierarchy: HeadingHierarchy, content: string }[],
    config: ChunkConfig
): SectionWithMetadata[] {
    const chunks: SectionWithMetadata[] = [];
    const overlapSize = Math.floor(config.size * config.overlapRatio);

    for (let i = 0; i < hierarchicalSections.length; i++) {
        const section = hierarchicalSections[i];
        const fullHeading = section.hierarchy.path.map((h, idx) => '#'.repeat(idx + 1) + ' ' + h).join(' > ');

        // コンテンツが短い場合はそのまま
        if (section.content.length <= config.size) {
            let content = section.content;

            // オーバーラップを追加
            content = addOverlapContext(
                content,
                hierarchicalSections,
                i,
                overlapSize
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
            // 長いコンテンツは文境界優先で分割
            const splitChunks = splitContentBySentenceBoundary(
                fullHeading,
                section.content,
                config.size,
                overlapSize,
                section.hierarchy // 階層情報を渡す
            );
            chunks.push(...splitChunks);
        }
    }

    return chunks;
}

// 文境界を優先したコンテンツ分割関数
function splitContentBySentenceBoundary(
    heading: string,
    content: string,
    chunkSize: number,
    overlapSize: number,
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

            // チャンクサイズを超える場合
            if (potentialChunk.length > chunkSize - overlapSize) {
                // 現在のチャンクを保存
                if (currentChunk.trim()) {
                    sections.push({
                        heading: sections.length > 0 ? `${heading} (Part ${chunkIndex + 1})` : heading,
                        content: addSentenceOverlap(currentChunk.trim(), sections, overlapSize),
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

                // 文が単体で制限を超える場合は強制分割
                if (sentence.length > chunkSize - overlapSize) {
                    const forceSplitChunks = forceSplit(sentence, chunkSize - overlapSize);
                    for (const chunk of forceSplitChunks) {
                        sections.push({
                            heading: `${heading} (Part ${chunkIndex + 1})`,
                            content: chunk,
                            // 階層情報を追加
                            headingLevel: hierarchy?.level,
                            headingPath: hierarchy?.path,
                            headingText: hierarchy?.text,
                            chunkPartNumber: chunkIndex + 1,
                            totalChunkParts: 0, // 後で更新
                            hasOverlap: false
                        });
                        chunkIndex++;
                    }
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
            content: addSentenceOverlap(currentChunk.trim(), sections, overlapSize),
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

// 文レベルでのオーバーラップ追加
function addSentenceOverlap(content: string, previousSections: SectionWithMetadata[], overlapSize: number): string {
    if (previousSections.length === 0 || overlapSize <= 0) {
        return content;
    }

    // 前のチャンクの最後の部分を取得
    const prevContent = previousSections[previousSections.length - 1].content;
    const sentences = splitIntoSentences(prevContent);

    // 前のチャンクから適切な量のオーバーラップを追加
    let overlap = '';
    for (let i = sentences.length - 1; i >= 0; i--) {
        const potentialOverlap = sentences.slice(i).join('');
        if (potentialOverlap.length <= overlapSize) {
            overlap = potentialOverlap;
            break;
        }
    }

    if (overlap.trim()) {
        return `...${overlap}\n\n${content}`;
    }

    return content;
}

// 強制分割（文境界で分割できない場合）
function forceSplit(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    let currentPos = 0;

    while (currentPos < text.length) {
        const chunk = text.slice(currentPos, currentPos + maxSize);
        chunks.push(chunk);
        currentPos += maxSize;
    }

    return chunks;
}

// オーバーラップコンテキストを追加する関数
function addOverlapContext(
    content: string,
    allSections: { hierarchy: HeadingHierarchy, content: string }[],
    currentIndex: number,
    overlapSize: number
): string {
    let result = content;

    // 前のセクションからコンテキストを追加
    if (currentIndex > 0 && overlapSize > 0) {
        const prevContent = allSections[currentIndex - 1].content;
        const prevOverlap = prevContent.slice(-overlapSize);
        if (prevOverlap.trim()) {
            result = `...${prevOverlap}\n\n${result}`;
        }
    }

    // 次のセクションからコンテキストを追加
    if (currentIndex < allSections.length - 1 && overlapSize > 0) {
        const nextContent = allSections[currentIndex + 1].content;
        const nextOverlap = nextContent.slice(0, overlapSize);
        if (nextOverlap.trim()) {
            result = `${result}\n\n${nextOverlap}...`;
        }
    }

    return result;
}

// オーバーラップを考慮した長いコンテンツ分割関数
function splitLongContentWithOverlap(
    heading: string,
    content: string,
    chunkSize: number,
    overlapSize: number
): Section[] {
    const sections: Section[] = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (currentChunk.length + line.length + 1 > chunkSize - overlapSize) {
            // チャンクサイズに達した場合
            if (currentChunk.trim()) {
                sections.push({
                    heading: `${heading} (Part ${chunkIndex + 1})`,
                    content: currentChunk.trim()
                });
                chunkIndex++;
            }

            // 次のチャンクを開始（オーバーラップを考慮）
            const overlapLines = currentChunk.split('\n').slice(-Math.floor(overlapSize / 50)); // 概算でオーバーラップ行数を計算
            currentChunk = overlapLines.join('\n') + (overlapLines.length > 0 ? '\n' : '') + line;
        } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
        }
    }

    // 最後のチャンク
    if (currentChunk.trim()) {
        sections.push({
            heading: chunkIndex > 0 ? `${heading} (Part ${chunkIndex + 1})` : heading,
            content: currentChunk.trim()
        });
    }

    return sections;
}

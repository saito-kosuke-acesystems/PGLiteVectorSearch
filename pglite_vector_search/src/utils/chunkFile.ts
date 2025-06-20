// セクションの型定義
interface Section {
    heading: string;
    content: string;
}

// チャンキング設定の型定義
interface ChunkingOptions {
    maxChunkSize: number;
    overlapSize: number;
    minChunkSize: number;
    useSemanticSplit: boolean;
    preserveContext: boolean;
}

export async function chunkFile(
    file: File, 
    maxChunkSize: number = 1000,
    options: Partial<ChunkingOptions> = {}
): Promise<{ section: string, content: string, filename: string }[]> {

    const chunkingOptions: ChunkingOptions = {
        maxChunkSize,
        overlapSize: Math.floor(maxChunkSize * 0.2), // 20%のオーバーラップ
        minChunkSize: Math.floor(maxChunkSize * 0.3), // 最小サイズは30%
        useSemanticSplit: true,
        preserveContext: true,
        ...options
    };

    // 拡張子別にファイルを処理
    const ext = file.name.split('.').pop()?.toLowerCase()
    let text: string;
    let sections: Section[] = [];
    switch (ext) {
        case 'txt':
            text = await file.text();
            sections = await chunkTxt(text, chunkingOptions);
            break;
        case 'md':
            text = await file.text();
            sections = await chunkMd(text, chunkingOptions);
            break
        default:
            // 例外をスロー
            throw new Error('対応していないファイル形式です。: ' + ext);
    }

    // セクションとファイル名のペアを返す
    return sections.map(section => ({
        section: section.heading,
        content: section.content,
        filename: file.name
    }));
}

async function chunkTxt(text: string, options: ChunkingOptions): Promise<Section[]> {
    // splitLongContentWithOverlapを使用してテキストを分割
    return splitLongContentWithOverlap('# 無題', text, options);
}

async function chunkMd(text: string, options: ChunkingOptions): Promise<Section[]> {
    const sections: Section[] = [];

    // テキストに「# 」で始まる行があるかチェック
    const lines = text.split(/\r?\n/);
    const hasH1 = lines.some(line => line.startsWith('# '));

    // 分割する見出しレベルを決定
    const headingPrefix = hasH1 ? '# ' : '## ';

    let currentHeading = '';
    let currentContent: string[] = [];

    for (const line of lines) {
        if (line.startsWith(headingPrefix)) {
            // 前のセクションを保存（存在する場合）
            if (currentHeading) {
                const content = currentContent.join('\n').trim();
                // セクション内容をコンテキスト保持しながら分割
                const splitSections = options.useSemanticSplit 
                    ? splitSemanticChunks(currentHeading, content, options)
                    : splitBySentenceImproved(currentHeading, content, options);
                sections.push(...splitSections);
            }

            // 新しいセクション開始
            currentHeading = line;
            currentContent = [];
        } else {
            // 現在のセクションにコンテンツを追加
            currentContent.push(line);
        }
    }

    // 最後のセクションを保存
    if (currentHeading) {
        const content = currentContent.join('\n').trim();
        const splitSections = options.useSemanticSplit 
            ? splitSemanticChunks(currentHeading, content, options)
            : splitBySentenceImproved(currentHeading, content, options);
        sections.push(...splitSections);
    }

    // 見出しのないコンテンツがある場合の処理
    if (!currentHeading && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
            const splitSections = options.useSemanticSplit 
                ? splitSemanticChunks('# 無題', content, options)
                : splitBySentenceImproved('# 無題', content, options);
            sections.push(...splitSections);
        }
    }

    return sections;
}

// 【旧版】文章の切れ目でコンテンツを分割する関数（後方互換性のため保持）
function splitBySentence(heading: string, content: string, maxChunkSize: number): Section[] {
    const options: ChunkingOptions = {
        maxChunkSize,
        overlapSize: Math.floor(maxChunkSize * 0.1),
        minChunkSize: Math.floor(maxChunkSize * 0.2),
        useSemanticSplit: false,
        preserveContext: false
    };
    
    return splitBySentenceImproved(heading, content, options);
}

// 長い文をmaxChunkSizeで分割する補助関数
function splitLongSentence(sentence: string, maxChunkSize: number): string[] {
    const parts: string[] = [];
    let currentPos = 0;

    while (currentPos < sentence.length) {
        const chunk = sentence.substring(currentPos, currentPos + maxChunkSize);
        parts.push(chunk);
        currentPos += maxChunkSize;
    }

    return parts;
}

// 【旧版】長いコンテンツを指定されたサイズで分割する関数（後方互換性のため保持）
function splitLongContent(heading: string, content: string, maxChunkSize: number): Section[] {
    const options: ChunkingOptions = {
        maxChunkSize,
        overlapSize: Math.floor(maxChunkSize * 0.1),
        minChunkSize: Math.floor(maxChunkSize * 0.2),
        useSemanticSplit: false,
        preserveContext: false
    };
    
    return splitLongContentWithOverlap(heading, content, options);
}

// セマンティックチャンクに分割する関数（コンテキストを保持しながら分割）
function splitSemanticChunks(heading: string, content: string, options: ChunkingOptions): Section[] {
    if (!content.trim()) {
        return [];
    }

    const sections: Section[] = [];
    
    // 段落レベルでの分割を優先
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
    
    let currentChunk = '';
    let previousChunk = ''; // オーバーラップ用
    
    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].trim();
        const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
        
        if (potentialChunk.length > options.maxChunkSize && currentChunk) {
            // 現在のチャンクを保存（オーバーラップあり）
            const chunkContent = options.preserveContext && previousChunk 
                ? previousChunk + '\n\n' + currentChunk 
                : currentChunk;
            
            // 最大サイズを超えないように調整
            const finalChunk = chunkContent.length > options.maxChunkSize * 1.5 
                ? currentChunk 
                : chunkContent;
                
            if (finalChunk.trim().length >= options.minChunkSize) {
                sections.push({
                    heading: heading,
                    content: finalChunk.trim()
                });
            }
            
            // オーバーラップ用に前のチャンクの一部を保存
            previousChunk = getOverlapText(currentChunk, options.overlapSize);
            currentChunk = paragraph;
        } else {
            currentChunk = potentialChunk;
        }
    }
    
    // 最後のチャンクを保存
    if (currentChunk.trim()) {
        const chunkContent = options.preserveContext && previousChunk 
            ? previousChunk + '\n\n' + currentChunk 
            : currentChunk;
            
        const finalChunk = chunkContent.length > options.maxChunkSize * 1.5 
            ? currentChunk 
            : chunkContent;
            
        if (finalChunk.trim().length >= options.minChunkSize) {
            sections.push({
                heading: heading,
                content: finalChunk.trim()
            });
        }
    }
    
    return sections.length > 0 ? sections : [{
        heading: heading,
        content: content
    }];
}

// 改善された文章境界分割（オーバーラップとコンテキスト保持付き）
function splitBySentenceImproved(heading: string, content: string, options: ChunkingOptions): Section[] {
    if (!content.trim()) {
        return [];
    }

    const sections: Section[] = [];
    
    // 改良された文章境界パターン（日本語対応強化）
    const sentencePattern = /([。！？][\s\n]*|[\n]{2,})/g;
    const sentences = content.split(sentencePattern)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    let currentChunk = '';
    let previousChunk = '';
    
    for (let i = 0; i < sentences.length; i += 2) {
        const text = sentences[i] || '';
        const punctuation = sentences[i + 1] || '';
        const sentence = (text + punctuation).trim();
        
        if (!sentence) continue;
        
        const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
        
        if (potentialChunk.length > options.maxChunkSize && currentChunk) {
            // オーバーラップを含めたチャンク作成
            const chunkContent = options.preserveContext && previousChunk 
                ? previousChunk + ' ' + currentChunk 
                : currentChunk;
                
            if (chunkContent.trim().length >= options.minChunkSize) {
                sections.push({
                    heading: heading,
                    content: chunkContent.trim()
                });
            }
            
            // オーバーラップ準備
            previousChunk = getOverlapText(currentChunk, options.overlapSize);
            currentChunk = sentence;
        } else {
            currentChunk = potentialChunk;
        }
    }
    
    // 最後のチャンクを保存
    if (currentChunk.trim()) {
        const chunkContent = options.preserveContext && previousChunk 
            ? previousChunk + ' ' + currentChunk 
            : currentChunk;
            
        if (chunkContent.trim().length >= options.minChunkSize) {
            sections.push({
                heading: heading,
                content: chunkContent.trim()
            });
        }
    }
    
    return sections.length > 0 ? sections : [{
        heading: heading,
        content: content
    }];
}

// オーバーラップ対応の長いコンテンツ分割
function splitLongContentWithOverlap(heading: string, content: string, options: ChunkingOptions): Section[] {
    if (content.length <= options.maxChunkSize) {
        return [{
            heading: heading,
            content: content
        }];
    }

    const sections: Section[] = [];
    let currentPos = 0;
    let previousOverlap = '';

    while (currentPos < content.length) {
        const chunkEnd = Math.min(currentPos + options.maxChunkSize - previousOverlap.length, content.length);
        let chunk = content.substring(currentPos, chunkEnd);
        
        // 改行や句点で適切な境界を見つける
        if (chunkEnd < content.length) {
            const idealBreakPoint = findBestBreakPoint(content, chunkEnd, options.maxChunkSize);
            if (idealBreakPoint > currentPos) {
                chunk = content.substring(currentPos, idealBreakPoint);
            }
        }
        
        // オーバーラップを追加
        const finalChunk = previousOverlap + chunk;
        
        if (finalChunk.trim().length >= options.minChunkSize) {
            sections.push({
                heading: heading,
                content: finalChunk.trim()
            });
        }
        
        // 次のオーバーラップを準備
        previousOverlap = getOverlapText(chunk, options.overlapSize);
        currentPos += chunk.length - (previousOverlap.length / 2); // オーバーラップ分を考慮
    }

    return sections;
}

// オーバーラップ用のテキスト抽出
function getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) {
        return text;
    }
    
    // 文章の境界を考慮してオーバーラップを作成
    const endPortion = text.substring(text.length - overlapSize);
    const sentenceStart = endPortion.search(/[。！？]\s*/);
    
    if (sentenceStart !== -1) {
        return endPortion.substring(sentenceStart + 1).trim();
    }
    
    // 単語境界を考慮
    const wordBoundary = endPortion.search(/\s+/);
    if (wordBoundary !== -1) {
        return endPortion.substring(wordBoundary).trim();
    }
    
    return endPortion;
}

// 最適な分割ポイントを見つける関数
function findBestBreakPoint(content: string, idealEnd: number, maxChunkSize: number): number {
    const searchRange = Math.min(maxChunkSize * 0.2, 100); // 20%の範囲内で検索
    const searchStart = Math.max(idealEnd - searchRange, 0);
    const searchEnd = Math.min(idealEnd + searchRange, content.length);
    
    // 優先順位付きの分割ポイント候補
    const breakPatterns = [
        /\n\s*\n/g,  // 段落区切り（最優先）
        /[。！？]\s*/g,  // 文末
        /[、，]\s*/g,    // 読点
        /\s+/g           // 空白
    ];
    
    for (const pattern of breakPatterns) {
        const matches = Array.from(content.substring(searchStart, searchEnd).matchAll(pattern));
        if (matches.length > 0) {
            // 理想位置に最も近いマッチを選択
            const bestMatch = matches.reduce((prev, curr) => {
                const prevDistance = Math.abs((searchStart + prev.index!) - idealEnd);
                const currDistance = Math.abs((searchStart + curr.index!) - idealEnd);
                return currDistance < prevDistance ? curr : prev;
            });
            return searchStart + bestMatch.index! + bestMatch[0].length;
        }
    }
    
    return idealEnd; // 適切な分割点が見つからない場合は元の位置を返す
}

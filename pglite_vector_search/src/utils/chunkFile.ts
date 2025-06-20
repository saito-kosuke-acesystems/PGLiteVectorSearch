// セクションの型定義
interface Section {
    heading: string;
    content: string;
}

export async function chunkFile(file: File, maxChunkSize: number = 1000): Promise<{ section: string, content: string, filename: string }[]> {

    // 拡張子別にファイルを処理
    const ext = file.name.split('.').pop()?.toLowerCase()
    let text: string;
    let sections: Section[] = [];
    switch (ext) {
        case 'txt':
            text = await file.text();
            sections = await chunkTxt(text, maxChunkSize);
            break;
        case 'md':
            text = await file.text();
            sections = await chunkMd(text, maxChunkSize);
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

async function chunkTxt(text: string, maxChunkSize: number): Promise<Section[]> {
    // splitLongContentを使用してテキストを分割
    return splitLongContent('# 無題', text, maxChunkSize);
}

async function chunkMd(text: string, maxChunkSize: number): Promise<Section[]> {
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
                // セクション内容を文章の切れ目で分割
                const splitSections = splitBySentence(currentHeading, content, maxChunkSize);
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
        const splitSections = splitBySentence(currentHeading, content, maxChunkSize);
        sections.push(...splitSections);
    }

    // 見出しのないコンテンツがある場合の処理
    if (!currentHeading && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
            const splitSections = splitBySentence('# 無題', content, maxChunkSize);
            sections.push(...splitSections);
        }
    }

    return sections;
}

// 文章の切れ目でコンテンツを分割する関数（改良された文章境界検出）
function splitBySentence(heading: string, content: string, maxChunkSize: number): Section[] {
    if (!content.trim()) {
        return [];
    }

    const sections: Section[] = [];

    // 文章境界の正規表現（句点、感嘆符、疑問符 + 改行・空白・文字の組み合わせ）
    const sentencePattern = /([。！？]+)(?=\s*(?:[^\s]|$))/g;

    // 文章を境界で分割
    const sentences = content.split(sentencePattern)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // 分割された文章を再構築（句読点と内容を組み合わせ）
    const reconstructedSentences: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
        const text = sentences[i] || '';
        const punctuation = sentences[i + 1] || '';

        if (text) {
            reconstructedSentences.push(text + punctuation);
        }
    }    // 各文を個別のセクションとして処理
    for (const sentence of reconstructedSentences) {
        if (!sentence.trim()) continue;

        // 一つの文がmaxChunkSizeを超える場合のみ分割
        if (sentence.length > maxChunkSize) {
            // 長い文をmaxChunkSizeで分割
            const longSentenceParts = splitLongSentence(sentence, maxChunkSize);
            for (const part of longSentenceParts) {
                sections.push({
                    heading: heading,
                    content: part
                });
            }
        } else {
            // 通常の文は個別のセクションとして追加
            sections.push({
                heading: heading,
                content: sentence.trim()
            });
        }
    }

    // 上記の方法で文章が適切に分割されない場合の代替処理
    if (sections.length === 0 || (sections.length === 1 && sections[0].content === content)) {
        // シンプルな句点分割にフォールバック
        const simpleSentences = content.split(/([。！？]+)/)
            .map((part, index, array) => {
                // 奇数インデックスは句読点、偶数インデックスは文章
                if (index % 2 === 0 && part.trim()) {
                    const punctuation = array[index + 1] || '';
                    return part.trim() + punctuation;
                }
                return null;
            })
            .filter(s => s && s.trim())
            .map(s => s!);

        // 各文を個別のセクションとして作成（長い文は分割）
        const finalSections: Section[] = [];
        for (const sentence of simpleSentences) {
            if (sentence.length > maxChunkSize) {
                const parts = splitLongSentence(sentence, maxChunkSize);
                for (const part of parts) {
                    finalSections.push({
                        heading: heading,
                        content: part
                    });
                }
            } else {
                finalSections.push({
                    heading: heading,
                    content: sentence.trim()
                });
            }
        }
        return finalSections.filter(section => section.content);
    }

    return sections;
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

// 長いコンテンツを指定されたサイズで分割する関数
function splitLongContent(heading: string, content: string, maxChunkSize: number): Section[] {
    if (content.length <= maxChunkSize) {
        return [{
            heading: heading,
            content: content
        }];
    }

    const sections: Section[] = [];
    const lines = content.split('\n');
    let currentChunk = ''; for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxChunkSize) {
            // 現在のチャンクがmaxChunkSizeを超える場合、チャンクを保存
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

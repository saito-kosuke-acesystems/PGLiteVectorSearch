// セクションの型定義
interface Section {
    heading: string;
    content: string;
}

export async function chunkFile(file: File, chunkSize: number = 1000): Promise<{ section: string, content: string, filename: string }[]> {

    // 拡張子別にファイルを処理
    const ext = file.name.split('.').pop()?.toLowerCase()
    let text: string;
    let sections: Section[] = [];
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
        filename: file.name
    }));
}

async function chunkTxt(text: string, chunkSize: number): Promise<Section[]> {
    // splitLongContentを使用してテキストを分割
    return splitLongContent('# 無題', text, chunkSize);
}

async function chunkMd(text: string, chunkSize: number): Promise<Section[]> {
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
                const splitSections = splitBySentence(currentHeading, content, chunkSize);
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
        const splitSections = splitBySentence(currentHeading, content, chunkSize);
        sections.push(...splitSections);
    }

    // 見出しのないコンテンツがある場合の処理
    if (!currentHeading && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
            const splitSections = splitBySentence('# 無題', content, chunkSize);
            sections.push(...splitSections);
        }
    }

    return sections;
}

// 文章の切れ目でコンテンツを分割する関数
function splitBySentence(heading: string, content: string, chunkSize: number): Section[] {
    if (!content.trim()) {
        return [];
    }

    // まずは段落で分割（連続する改行）
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
    const sections: Section[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        // 段落内を句点で分割
        const sentences = paragraph.split('。').filter(s => s.trim());
        
        for (let i = 0; i < sentences.length; i++) {
            let sentence = sentences[i].trim();
            if (!sentence) continue;
            
            // 最後の文でない場合は句点を追加
            if (i < sentences.length - 1) {
                sentence += '。';
            }
            
            // 現在のチャンクに追加すると長すぎる場合
            if (currentChunk && (currentChunk.length + sentence.length + 1) > chunkSize) {
                // 現在のチャンクを保存
                if (currentChunk.trim()) {
                    sections.push({
                        heading: heading,
                        content: currentChunk.trim()
                    });
                }
                currentChunk = sentence;
            } else {
                // 現在のチャンクに追加
                currentChunk += (currentChunk ? '\n' : '') + sentence;
            }
        }
        
        // 段落の終わりで改行を追加（次の段落がある場合）
        if (currentChunk && paragraphs.indexOf(paragraph) < paragraphs.length - 1) {
            currentChunk += '\n';
        }
    }

    // 最後のチャンクを保存
    if (currentChunk.trim()) {
        sections.push({
            heading: heading,
            content: currentChunk.trim()
        });
    }

    // 空の場合は元のコンテンツをそのまま返す
    if (sections.length === 0) {
        return [{
            heading: heading,
            content: content
        }];
    }

    return sections;
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

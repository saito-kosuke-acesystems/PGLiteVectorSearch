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

    // テキストを「# 」で始まる行で分割
    const lines = text.split(/\r?\n/);
    let currentHeading = '';
    let currentContent: string[] = [];

    for (const line of lines) {
        if (line.startsWith('# ')) {
            // 前のセクションを保存（存在する場合）
            if (currentHeading) {
                const content = currentContent.join('\n').trim();
                // セクション内容が長い場合は分割
                const splitSections = splitLongContent(currentHeading, content, chunkSize);
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
        const splitSections = splitLongContent(currentHeading, content, chunkSize);
        sections.push(...splitSections);
    }

    // 見出しのないコンテンツがある場合の処理
    if (!currentHeading && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
            const splitSections = splitLongContent('# 無題', content, chunkSize);
            sections.push(...splitSections);
        }
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

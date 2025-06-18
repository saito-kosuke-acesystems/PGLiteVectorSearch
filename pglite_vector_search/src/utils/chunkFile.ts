export async function chunkFile(file: File, chunkSize: number = 1000): Promise<{content: string, filename: string}[]> {

    // 拡張子別にファイルを処理
    const ext = file.name.split('.').pop()?.toLowerCase()
    let text: string;
    let chunks: string[] = [];
    switch (ext) {
        case 'txt':
            text = await file.text();
            chunks = await chunkTxt(text);
            break;
        case 'md':
            text = await file.text();
            chunks = await chunkMd(text);
            break
        default:
            // 例外をスロー
            throw new Error('対応していないファイル形式です。: ' + ext);
    }

    // チャンクとファイル名のペアを返す
    return chunks.map(content => ({
        content,
        filename: file.name
    }));
}

async function chunkTxt(text: string): Promise<string[]> {

    // MEMO:Wikipediaから取得したファイル専用の分割方法になってます
    // テキストを「改行＋== 」の直前で分割
    const retChunks = text.split(/\r?\n==\s+/).map(chunk => chunk.trim()).filter(chunk => chunk.length > 0)

    // チャンクの文字数が一定値を超える場合はさらに分割
    const maxChunkSize = 1000;
    for (let i = 0; i < retChunks.length; i++) {
        if (retChunks[i].length > maxChunkSize) {
            const subChunks: string[] = [];
            for (let j = 0; j < retChunks[i].length; j += maxChunkSize) {
                subChunks.push(retChunks[i].slice(j, j + maxChunkSize));
            }
            retChunks.splice(i, 1, ...subChunks);
            i += subChunks.length - 1; // インデックスを調整
        }
    }

    return retChunks;
}

async function chunkMd(text: string): Promise<string[]> {

    // テキストを「改行+# 」の直前で分割
    const retChunks = text.split(/\r?\n#\s+/).map(chunk => chunk.trim()).filter(chunk => chunk.length > 0)

    // チャンクの文字数が一定値を超える場合はさらに分割
    // 分割時は1つ前のチャンクとオーバーラップさせる
    const maxChunkSize = 500;
    const overlap = 100;
    for (let i = 0; i < retChunks.length; i++) {
        // 改行コードを削除
        retChunks[i] = retChunks[i].replace(/\r?\n/g, ' ');
        if (retChunks[i].length > maxChunkSize) {
            const subChunks: string[] = [];
            let j = 0;
            while (j < retChunks[i].length) {
                // オーバーラップ部分を考慮して分割
                const start = j === 0 ? 0 : Math.max(0, j - overlap);
                const end = j + maxChunkSize;
                subChunks.push(retChunks[i].slice(start, end));
                j += maxChunkSize;
            }
            retChunks.splice(i, 1, ...subChunks);
            i += subChunks.length - 1; // インデックスを調整
        }
    }

    return retChunks;
}

/**
 * chunkFile.ts のテスト
 * Node.js環境で実行するシンプルなテストファイル
 */

import { chunkFile } from '../chunkFile';

// テスト用のFile オブジェクトを作成するヘルパー関数
function createTestFile(content: string, filename: string): File {
    // Node.js環境での File オブジェクトシミュレーション
    const blob = new Blob([content], { type: 'text/plain' });
    return new File([blob], filename, { type: 'text/plain' });
}

// アサーション関数
function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`アサーションエラー: ${message}`);
    }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
    if (actual !== expected) {
        throw new Error(`アサーションエラー: ${message}. 期待値: ${expected}, 実際: ${actual}`);
    }
}

function assertGreaterThan(actual: number, expected: number, message: string) {
    if (actual <= expected) {
        throw new Error(`アサーションエラー: ${message}. ${actual} > ${expected} が期待されました`);
    }
}

function assertContains(str: string, substring: string, message: string) {
    if (!str.includes(substring)) {
        throw new Error(`アサーションエラー: ${message}. "${str}" に "${substring}" が含まれていません`);
    }
}

// テスト関数群
async function testHierarchyParsing() {
    console.log('🧪 階層構造解析テスト');

    const testContent = `# メインタイトル
メインの内容です。

## サブセクション1
サブセクション1の内容です。

### 詳細1
詳細1の内容です。

### 詳細2
詳細2の内容です。

## サブセクション2
サブセクション2の内容です。`;

    const file = createTestFile(testContent, 'test.md');
    const chunks = await chunkFile(file, 500);

    assertGreaterThan(chunks.length, 0, 'チャンクが生成されること');

    // メインタイトルが含まれているか
    const mainTitleChunk = chunks.find(chunk => 
        chunk.section.includes('# メインタイトル')
    );
    assert(mainTitleChunk !== undefined, 'メインタイトルのチャンクが存在すること');

    // サブセクションが正しい階層パスを持っているか
    const subSection1Chunk = chunks.find(chunk => 
        chunk.section.includes('メインタイトル > ## サブセクション1')
    );
    assert(subSection1Chunk !== undefined, 'サブセクション1の階層パスが正しいこと');

    // 3レベルの階層が正しく認識されているか
    const detailChunk = chunks.find(chunk => 
        chunk.section.includes('メインタイトル > ## サブセクション1 > ### 詳細1')
    );
    assert(detailChunk !== undefined, '3レベル階層が正しく認識されること');

    console.log('✅ 階層構造解析テスト完了');
}

async function testOverlapFeature() {
    console.log('🧪 オーバーラップ機能テスト');

    const testContent = `# セクション1
これは最初のセクションです。重要な情報が含まれています。

# セクション2
これは2番目のセクションです。関連する情報があります。

# セクション3
これは最後のセクションです。`;

    const file = createTestFile(testContent, 'overlap.md');
    const chunks = await chunkFile(file, 200);

    assertGreaterThan(chunks.length, 0, 'チャンクが生成されること');

    // セクション2のチャンクにオーバーラップが含まれているか確認
    const section2Chunk = chunks.find(chunk => 
        chunk.section.includes('# セクション2')
    );
    assert(section2Chunk !== undefined, 'セクション2のチャンクが存在すること');

    if (section2Chunk && chunks.length > 1) {
        // オーバーラップの印が含まれているか
        assert(
            section2Chunk.content.includes('...') || section2Chunk.content.length > 50,
            'オーバーラップ機能が動作していること'
        );
    }

    console.log('✅ オーバーラップ機能テスト完了');
}

async function testChunkSizeControl() {
    console.log('🧪 チャンクサイズ制御テスト');

    const longContent = 'これは非常に長いコンテンツです。'.repeat(50);
    const testContent = `# 長いセクション\n${longContent}`;

    const file = createTestFile(testContent, 'long.md');
    const chunks = await chunkFile(file, 200);

    // 長いコンテンツが複数のチャンクに分割されているか
    assertGreaterThan(chunks.length, 1, '長いコンテンツが複数チャンクに分割されること');

    // 各チャンクがサイズ制限内にあるか（オーバーラップ分を考慮）
    chunks.forEach((chunk, index) => {
        // オーバーラップを考慮して、多少の超過は許容
        assert(
            chunk.content.length <= 300, // 200 * 1.5
            `チャンク${index + 1}がサイズ制限内にあること`
        );
    });

    console.log('✅ チャンクサイズ制御テスト完了');
}

async function testEdgeCases() {
    console.log('🧪 エッジケーステスト');

    // 見出しのない文書
    {
        const testContent = `これは見出しのない普通のテキストです。
複数行にわたる内容ですが、Markdownの見出しは含まれていません。`;

        const file = createTestFile(testContent, 'no_heading.md');
        const chunks = await chunkFile(file, 150);

        assertGreaterThan(chunks.length, 0, '見出しのない文書でもチャンクが生成されること');
        assertContains(chunks[0].section, '無題', '見出しのない文書は「無題」として処理されること');
    }

    // 非常に短い文書
    {
        const testContent = `# 短い\n内容`;

        const file = createTestFile(testContent, 'short.md');
        const chunks = await chunkFile(file, 1000);

        assertEqual(chunks.length, 1, '短い文書は1つのチャンクになること');
        assertEqual(chunks[0].content, '内容', '内容が正しく処理されること');
        assertContains(chunks[0].section, '短い', '見出しが正しく処理されること');
    }

    // 空の文書
    {
        const testContent = '';
        const file = createTestFile(testContent, 'empty.md');
        const chunks = await chunkFile(file, 100);

        assertEqual(chunks.length, 0, '空の文書はチャンクが生成されないこと');
    }

    // 特殊文字を含む見出し
    {
        const testContent = `# 特殊文字!@#$%^&*()
内容1

## 日本語見出し　＃＆
内容2`;

        const file = createTestFile(testContent, 'special.md');
        const chunks = await chunkFile(file, 200);

        assertGreaterThan(chunks.length, 0, '特殊文字を含む見出しでもチャンクが生成されること');

        const specialChunk = chunks.find(chunk => 
            chunk.section.includes('特殊文字!@#$%^&*()')
        );
        assert(specialChunk !== undefined, '特殊文字が正しく処理されること');
    }

    console.log('✅ エッジケーステスト完了');
}

async function testTxtFiles() {
    console.log('🧪 TXTファイルテスト');

    const testContent = `これはテキストファイルのテストです。
複数行にわたる内容があります。
Markdownの見出しはありませんが、適切に分割される必要があります。`;

    const file = createTestFile(testContent, 'test.txt');
    const chunks = await chunkFile(file, 100);

    assertGreaterThan(chunks.length, 0, 'TXTファイルでもチャンクが生成されること');
    assertContains(chunks[0].section, '無題', 'TXTファイルは「無題」として処理されること');
    assertEqual(chunks[0].filename, 'test.txt', 'ファイル名が正しく設定されること');

    console.log('✅ TXTファイルテスト完了');
}

async function testUnsupportedFiles() {
    console.log('🧪 未対応ファイル形式テスト');

    const testContent = 'テスト内容';
    const file = createTestFile(testContent, 'test.pdf');

    try {
        await chunkFile(file, 100);
        throw new Error('例外が発生すべきでした');
    } catch (error) {
        assertContains(
            (error as Error).message, 
            '対応していないファイル形式です。: pdf',
            '未対応ファイル形式で適切な例外が発生すること'
        );
    }

    console.log('✅ 未対応ファイル形式テスト完了');
}

// メインテスト実行関数
async function runAllTests() {
    console.log('🚀 chunkFile.ts テスト開始\n');

    try {
        await testHierarchyParsing();
        await testOverlapFeature();
        await testChunkSizeControl();
        await testEdgeCases();
        await testTxtFiles();
        await testUnsupportedFiles();

        console.log('\n🎉 すべてのテストが成功しました！');
    } catch (error) {        console.error('\n❌ テストが失敗しました:', error);
        throw error;
    }
}

// Node.js環境でのみ実行
if (typeof window === 'undefined') {
    runAllTests();
}

export { runAllTests };

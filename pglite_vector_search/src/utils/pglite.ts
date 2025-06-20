import { PGlite } from "@electric-sql/pglite";
// @ts-ignore MEMO:型エラーが発生するのでignoreしておく tsconfig.jsonを修正する必要がある？
import { vector } from "@electric-sql/pglite/vector";
import { chunkFile } from "./chunkFile";

// 型定義
interface ChunkData {
    section: string;
    content: string;
    filename: string;
}

// pgvector 拡張を登録
const pglite = new PGlite({
  extensions: { vector },
  // dataDir: "./data"  // MEMO：dataDirが未指定の場合はメモリ内で動作する
});

export function getPGlite(): PGlite {
  return pglite;
}

export async function initMemory(dimension: number) {

  // ベクトル検索用の pgvector 拡張を有効化
  await pglite.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  // 検索用 memory テーブルを定義（改善されたスキーマ）
  // MEMO：vectorの次元数はモデルに依存する為、使用するモデルに合わせて変える事  
  await pglite.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id SERIAL PRIMARY KEY,
    filename TEXT,
    section TEXT,
    section_sequence INTEGER,
    chunk_index INTEGER DEFAULT 0,
    content TEXT NOT NULL,
    embedding vector('${dimension}'),
    has_overlap BOOLEAN DEFAULT FALSE,
    context_size INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  
  -- ベクトル検索用のインデックス（HNSW）
  CREATE INDEX IF NOT EXISTS memory_embedding_hnsw_idx ON memory USING hnsw (embedding vector_cosine_ops);
  
  -- 複合検索用のインデックス
  CREATE INDEX IF NOT EXISTS memory_filename_section_idx ON memory (filename, section);
  CREATE INDEX IF NOT EXISTS memory_section_sequence_idx ON memory (section, section_sequence);
  
  -- 全文検索用のインデックス（GIN）
  CREATE INDEX IF NOT EXISTS memory_content_gin_idx ON memory USING gin(to_tsvector('english', content));
  `);

}

export async function insertMemory(content: string, embedding: number[], filename?: string, section?: string, sectionSequence?: number) {
  const vec = JSON.stringify(embedding);
  // エスケープ処理
  const safeContent = content.replace(/'/g, "''");
  const safeVec = vec.replace(/'/g, "''");
  const safeFilename = filename ? filename.replace(/'/g, "''") : null;
  const safeSection = section ? section.replace(/'/g, "''") : null;
  const safeSectionSequence = sectionSequence !== undefined ? sectionSequence : null;

  // 高速化の為awaitしない なんかあったら戻す
  pglite.exec(
    `INSERT INTO memory (filename, section, section_sequence, content, embedding) VALUES ('${safeFilename}', '${safeSection}', ${safeSectionSequence}, '${safeContent}', '${safeVec}')`);
}

export async function searchMemory(embedding: number[], limit: number = 3): Promise<any[]> {
  const vec = JSON.stringify(embedding);
  const threshold = 0.3;  // 距離の閾値
  const result = await pglite.query(`
    SELECT id, filename, section, section_sequence, content, embedding, (embedding <=> '${vec}') AS distance
    FROM memory
    WHERE (embedding <=> '${vec}') < ${threshold}
    ORDER BY distance
    LIMIT ${limit};`);
  return result.rows;
}

// ハイブリッド検索（β）
export async function hybridSearchMemory(keywords: string | string[], embedding: number[], limit: number = 3): Promise<any[]> {
  const vec = JSON.stringify(embedding);
  const vectorWeight = 0.5; // ベクトル検索の重み
  const keywordWeight = 0.4; // キーワード検索の重み
  const maxKeywordScore = 1.0; // キーワードスコアの最大値
  const minCombinedScore = 0.3; // 最小結合スコア
  // キーワードの処理
  let keywordConditions = [];
  let keywordScoreExpression = "";
  let keywordCondition = "";

  if (Array.isArray(keywords)) {
    // 空の配列または空文字のみの配列の場合は特殊処理
    if (keywords.length === 0 || keywords.every(k => k.trim() === '')) {
      return searchMemory(embedding, limit);
    }
    // 有効なキーワードのみをフィルタリングし、重複を除去
    const validKeywords = Array.from(new Set(keywords.filter(k => k.trim() !== '').map(k => k.trim().toLowerCase())));

    // 各キーワードの存在をチェックする式を作成（0または1の値）
    keywordConditions = validKeywords.map(k => {
      const safeKeyword = k.replace(/'/g, "''");
      return `CASE WHEN LOWER(content) LIKE '%${safeKeyword}%' THEN 1 ELSE 0 END`;
    });

    if (keywordConditions.length === 0) {
      return searchMemory(embedding, limit);
    }

    // WHERE句用の条件
    const whereConditions = validKeywords.map(k =>
      `content ILIKE '%${k.replace(/'/g, "''")}%'`
    );
    keywordCondition = whereConditions.join(' OR ');

    // キーワードスコア計算式（マッチしたキーワード数に基づく、重複なし）
    keywordScoreExpression = `LEAST((${keywordConditions.join(' + ')}) * ${keywordWeight} / ${validKeywords.length}, ${maxKeywordScore})`;
  } else {
    // 文字列の場合
    const safeKeyword = keywords.replace(/'/g, "''").trim().toLowerCase();
    if (safeKeyword === '') {
      return searchMemory(embedding, limit);
    }

    keywordCondition = `content ILIKE '%${safeKeyword}%'`;

    // 存在ベースのスコア計算（0または1）
    keywordScoreExpression = `CASE WHEN LOWER(content) LIKE '%${safeKeyword}%' THEN ${keywordWeight} ELSE 0 END`;
  }
  // スコア計算式を変数として定義
  const combinedScoreExpression = `
    CASE
      WHEN ${keywordCondition} THEN ${keywordScoreExpression}
      ELSE 0
    END + 
    (${vectorWeight} * (1 - (embedding <=> '${vec}')))
  `;
  
  // 検索条件でsectionを取得（重複なし、スコア順）
  const sectionResult = await pglite.query(`
    WITH scored_results AS (
      SELECT 
        section,
        MAX(${combinedScoreExpression}) AS max_combined_score
      FROM memory
      WHERE ${keywordCondition} OR (embedding <=> '${vec}') < 1.0
      GROUP BY section
    )
    SELECT section
    FROM scored_results
    WHERE max_combined_score >= ${minCombinedScore}
    ORDER BY max_combined_score DESC
    LIMIT ${limit};
  `);

  console.log('sectionResult:', sectionResult.rows);
  
  // 取得したsectionに基づいて、同じsectionのチャンクを全て取得
  if (sectionResult.rows.length === 0) {
    return [];
  }
  
  const sections = sectionResult.rows.map((row: any) => row.section);
  const sectionConditions = sections.map(section => {
    const safeSection = section ? section.replace(/'/g, "''") : null;
    return safeSection ? `section = '${safeSection}'` : `section IS NULL`;
  }).join(' OR ');
  
  const result = await pglite.query(`
    SELECT id, filename, section, section_sequence, content, embedding, (embedding <=> '${vec}') AS distance
    FROM memory
    WHERE ${sectionConditions}
    ORDER BY distance
    LIMIT 10;
  `);

  console.log('hybridSearchMemory result:', result.rows);
  
  return result.rows;
}

// 【案2】効率的なベクトル検索: スマートプリフィルタリング + 動的検索パラメータ
export async function efficientVectorSearch(
  embedding: number[], 
  options: {
    limit?: number;
    filename?: string;
    section?: string;
    contentFilter?: string;
    vectorThreshold?: number;
    useAdaptiveThreshold?: boolean;
    maxCandidates?: number;
  } = {}
): Promise<any[]> {
  const {
    limit = 5,
    filename,
    section,
    contentFilter,
    vectorThreshold = 0.5,
    useAdaptiveThreshold = true,
    maxCandidates = 50
  } = options;

  const vec = JSON.stringify(embedding);
  
  // Phase 1: スマートプリフィルタリング
  const prefilterConditions: string[] = [];
  const prefilterParams: string[] = [];
  
  // メタデータによる事前絞り込み
  if (filename) {
    const safeFilename = filename.replace(/'/g, "''");
    prefilterConditions.push(`filename = '${safeFilename}'`);
  }
  
  if (section) {
    const safeSection = section.replace(/'/g, "''");
    prefilterConditions.push(`section = '${safeSection}'`);
  }
  
  if (contentFilter) {
    const safeContentFilter = contentFilter.replace(/'/g, "''").toLowerCase();
    prefilterConditions.push(`LOWER(content) LIKE '%${safeContentFilter}%'`);
  }
  
  // 動的な距離閾値の決定
  let adaptiveThreshold = vectorThreshold;
  if (useAdaptiveThreshold) {
    // 事前サンプリングで適切な閾値を推定
    const sampleQuery = `
      SELECT AVG(embedding <=> '${vec}') as avg_distance,
             STDDEV(embedding <=> '${vec}') as std_distance
      FROM (
        SELECT embedding 
        FROM memory 
        ${prefilterConditions.length > 0 ? 'WHERE ' + prefilterConditions.join(' AND ') : ''}
        ORDER BY RANDOM() 
        LIMIT 100
      ) sample;
    `;
      const sampleResult = await pglite.query(sampleQuery);
    if (sampleResult.rows.length > 0 && (sampleResult.rows[0] as any).avg_distance) {
      const avgDistance = parseFloat((sampleResult.rows[0] as any).avg_distance);
      const stdDistance = parseFloat((sampleResult.rows[0] as any).std_distance || '0.1');
      // 平均 - 1標準偏差を基準として動的閾値を設定
      adaptiveThreshold = Math.max(0.1, Math.min(0.8, avgDistance - stdDistance));
    }
  }
  
  // Phase 2: 段階的ベクトル検索
  // Step 1: 大まかな候補を高速で取得
  const candidateQuery = `
    SELECT id, filename, section, section_sequence, content, embedding,
           (embedding <=> '${vec}') AS distance
    FROM memory
    WHERE (embedding <=> '${vec}') < ${adaptiveThreshold}
    ${prefilterConditions.length > 0 ? 'AND ' + prefilterConditions.join(' AND ') : ''}
    ORDER BY distance
    LIMIT ${maxCandidates};
  `;
  
  const candidates = await pglite.query(candidateQuery);
  
  // Step 2: 候補が少ない場合は閾値を緩和して再検索
  if (candidates.rows.length < limit) {
    const relaxedThreshold = Math.min(1.0, adaptiveThreshold * 1.5);
    const relaxedQuery = `
      SELECT id, filename, section, section_sequence, content, embedding,
             (embedding <=> '${vec}') AS distance
      FROM memory
      WHERE (embedding <=> '${vec}') < ${relaxedThreshold}
      ${prefilterConditions.length > 0 ? 'AND ' + prefilterConditions.join(' AND ') : ''}
      ORDER BY distance
      LIMIT ${Math.max(limit, 10)};
    `;
    
    const relaxedResult = await pglite.query(relaxedQuery);
    return relaxedResult.rows.slice(0, limit);
  }
  
  // Phase 3: 結果の後処理と品質向上
  const results = candidates.rows.slice(0, limit);
  
  // 同一セクション内での重複排除（オプション）
  const uniqueResults = [];
  const seenSections = new Set();
    for (const result of results) {
    const resultData = result as any;
    const sectionKey = `${resultData.filename || ''}_${resultData.section || ''}`;
    if (!seenSections.has(sectionKey) || seenSections.size < limit) {
      uniqueResults.push(result);
      seenSections.add(sectionKey);
      
      if (uniqueResults.length >= limit) break;
    }
  }
  
  return uniqueResults.length > 0 ? uniqueResults : results;
}

// クエリの特性に基づく検索パラメータの自動最適化（セクションキーワード判断付き）
export async function adaptiveVectorSearch(
  embedding: number[],
  keywords: string[],
  queryText?: string,
  limit: number = 5
): Promise<any[]> {
  // クエリテキストの特性を分析
  const queryCharacteristics = analyzeQuery(queryText || '');
  
  // 特性に基づいて検索パラメータを動的調整
  const searchOptions = {
    limit: limit * 2, // 初期検索では多めに取得
    vectorThreshold: queryCharacteristics.isSpecific ? 0.3 : 0.5,
    useAdaptiveThreshold: true,
    maxCandidates: queryCharacteristics.isComplex ? 100 : 50,
    contentFilter: queryCharacteristics.hasKeywords ? queryCharacteristics.mainKeyword : undefined
  };
  
  // 初期ベクトル検索を実行
  const initialResults = await efficientVectorSearch(embedding, searchOptions);
  
  // セクションにキーワードが含まれているかチェックして結果を再評価
  if (keywords.length > 0) {
    const rerankedResults = rerankByKeywordMatch(initialResults, keywords, queryText || '');
    return rerankedResults.slice(0, limit);
  }
  
  return initialResults.slice(0, limit);
}

// キーワードマッチによる結果の再ランキング
function rerankByKeywordMatch(results: any[], keywords: string[], queryText: string): any[] {
  return results.map((result: any) => {
    const resultData = result as any;
    const content = (resultData.content || '').toLowerCase();
    const section = (resultData.section || '').toLowerCase();
    
    // コンテンツ内でのキーワードマッチスコア
    let contentMatchScore = 0;
    let sectionMatchScore = 0;
    
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      
      // コンテンツ内のマッチ（部分一致）
      if (content.includes(keywordLower)) {
        contentMatchScore += 1;
      }
      
      // セクション名でのマッチ（より高い重み）
      if (section.includes(keywordLower)) {
        sectionMatchScore += 2;
      }
    }
    
    // 総合的な関連度スコアを計算
    const totalKeywordMatches = contentMatchScore + sectionMatchScore;
    const keywordMatchRatio = totalKeywordMatches / (keywords.length * 3); // 最大3点（コンテンツ1点+セクション2点）
    
    // ベクトル距離と組み合わせた総合スコア
    const vectorScore = 1 - (parseFloat(resultData.distance) || 0);
    const combinedScore = (vectorScore * 0.6) + (keywordMatchRatio * 0.4);
    
    return {
      ...result,
      keywordMatchScore: totalKeywordMatches,
      combinedScore: combinedScore,
      hasKeywordInSection: sectionMatchScore > 0,
      hasKeywordInContent: contentMatchScore > 0
    };
  }).sort((a: any, b: any) => {
    // セクションにキーワードがある場合を優先
    if (a.hasKeywordInSection && !b.hasKeywordInSection) return -1;
    if (!a.hasKeywordInSection && b.hasKeywordInSection) return 1;
    
    // 総合スコアでソート
    return b.combinedScore - a.combinedScore;
  });
}

// クエリ特性分析の補助関数
function analyzeQuery(queryText: string): {
  isSpecific: boolean;
  isComplex: boolean;
  hasKeywords: boolean;
  mainKeyword?: string;
} {
  const text = queryText.toLowerCase().trim();
  
  // 具体性の判定（固有名詞、数値、専門用語の存在）
  const specificPatterns = /[A-Z][a-z]+|[0-9]+|[ぁ-ん]{1,2}[ァ-ヶ]+/g;
  const isSpecific = (text.match(specificPatterns) || []).length > 0;
  
  // 複雑性の判定（文章の長さ、句読点の数）
  const isComplex = text.length > 20 || (text.match(/[、。？！]/g) || []).length > 1;
  
  // キーワードの抽出
  const keywords = text.split(/[\s、。？！]+/).filter(word => word.length > 1);
  const hasKeywords = keywords.length > 0;
  const mainKeyword = hasKeywords ? keywords[0] : undefined;
  
  return {
    isSpecific,
    isComplex,
    hasKeywords,
    mainKeyword
  };
}

export async function insertMemoryBatch(
    chunks: Array<{
        content: string;
        embedding: number[];
        filename?: string;
        section?: string;
        sectionSequence?: number;
        chunkIndex?: number;
        hasOverlap?: boolean;
        contextSize?: number;
    }>
) {
    const startTime = Date.now();
    console.log(`バッチ挿入開始: ${chunks.length}件のチャンク`);
    
    try {
        // トランザクション開始
        await pglite.exec('BEGIN');
        
        // プリペアドステートメント用のクエリ
        const insertQuery = `
            INSERT INTO memory (filename, section, section_sequence, content, embedding, chunk_index, has_overlap, context_size) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        // バッチ挿入実行
        for (const chunk of chunks) {
            await pglite.query(insertQuery, [
                chunk.filename || null,
                chunk.section || null,
                chunk.sectionSequence || null,
                chunk.content,
                JSON.stringify(chunk.embedding),
                chunk.chunkIndex || null,
                chunk.hasOverlap || false,
                chunk.contextSize || chunk.content.length
            ]);
        }
        
        // トランザクション確定
        await pglite.exec('COMMIT');
        
        const duration = Date.now() - startTime;
        console.log(`バッチ挿入完了: ${duration}ms`);
        
    } catch (error) {
        // エラー時はロールバック
        await pglite.exec('ROLLBACK');
        console.error('バッチ挿入エラー:', error);
        throw error;
    }
}

// 【新版】改善されたベクトル検索（オーバーラップ対応・コンテキスト保持）
export async function enhancedVectorSearch(
    embedding: number[], 
    options: {
        limit?: number;
        filename?: string;
        section?: string;
        keywords?: string[];
        minRelevanceScore?: number;
        includeContext?: boolean;
        deduplicateOverlaps?: boolean;
        weightings?: {
            vector: number;
            keyword: number;
            context: number;
        };
    } = {}
): Promise<any[]> {
    const {
        limit = 5,
        filename,
        section,
        keywords = [],
        minRelevanceScore = 0.3,
        includeContext = true,
        deduplicateOverlaps = true,
        weightings = { vector: 0.6, keyword: 0.3, context: 0.1 }
    } = options;

    const vec = JSON.stringify(embedding);
    
    // フィルタ条件の構築
    const filters: string[] = [];
    if (filename) {
        filters.push(`filename = '${filename.replace(/'/g, "''")}'`);
    }
    if (section) {
        filters.push(`section = '${section.replace(/'/g, "''")}'`);
    }
    
    // キーワード検索条件
    let keywordCondition = '';
    if (keywords.length > 0) {
        const keywordFilters = keywords
            .filter(k => k.trim())
            .map(k => `content ILIKE '%${k.trim().replace(/'/g, "''").toLowerCase()}%'`);
        if (keywordFilters.length > 0) {
            keywordCondition = keywordFilters.join(' OR ');
        }
    }
    
    // 総合スコア計算式
    const vectorScore = `(1 - (embedding <=> '${vec}'))`;
    
    let keywordScore = '0';
    if (keywordCondition) {
        const keywordMatches = keywords
            .filter(k => k.trim())
            .map(k => `CASE WHEN content ILIKE '%${k.trim().replace(/'/g, "''").toLowerCase()}%' THEN 1 ELSE 0 END`)
            .join(' + ');
        keywordScore = keywords.length > 0 ? `(${keywordMatches}) / ${keywords.length}` : '0';
    }
    
    const contextScore = includeContext ? `(context_size / 2000.0)` : '0'; // 正規化されたコンテキストサイズ
    
    const relevanceScore = `
        (${weightings.vector} * ${vectorScore}) + 
        (${weightings.keyword} * ${keywordScore}) + 
        (${weightings.context} * ${contextScore})
    `;
    
    // 基本検索クエリ
    let baseQuery = `
        SELECT 
            id, filename, section, section_sequence, chunk_index, content, embedding, 
            has_overlap, context_size,
            (embedding <=> '${vec}') AS vector_distance,
            ${relevanceScore} AS relevance_score
        FROM memory
        WHERE (embedding <=> '${vec}') < 1.0
    `;
    
    // フィルタ適用
    if (filters.length > 0) {
        baseQuery += ` AND ${filters.join(' AND ')}`;
    }
    
    // キーワード条件適用（OR条件）
    if (keywordCondition) {
        baseQuery += ` AND (${keywordCondition})`;
    }
    
    baseQuery += `
        AND ${relevanceScore} >= ${minRelevanceScore}
        ORDER BY relevance_score DESC, vector_distance ASC
        LIMIT ${limit * 2}
    `;
    
    const result = await pglite.query(baseQuery);
    let results = result.rows;
    
    // オーバーラップ重複除去
    if (deduplicateOverlaps && results.length > 0) {
        results = deduplicateOverlapResults(results as any[], limit);
    }
    
    // 結果数制限
    return results.slice(0, limit);
}

// オーバーラップしたチャンクの重複除去
function deduplicateOverlapResults(results: any[], targetLimit: number): any[] {
    const uniqueResults: any[] = [];
    const seenSections = new Map<string, any>();
    
    // セクション単位でグループ化し、最も関連度の高いチャンクを選択
    for (const result of results) {
        const sectionKey = `${result.filename || 'unknown'}_${result.section || 'untitled'}`;
        
        if (!seenSections.has(sectionKey) || 
            result.relevance_score > seenSections.get(sectionKey).relevance_score) {
            seenSections.set(sectionKey, result);
        }
    }
    
    // セクション代表チャンクから上位を選択
    const sectionRepresentatives = Array.from(seenSections.values())
        .sort((a, b) => b.relevance_score - a.relevance_score);
    
    // 必要に応じて同一セクション内の追加チャンクも含める
    const finalResults = [...sectionRepresentatives.slice(0, targetLimit)];
    
    if (finalResults.length < targetLimit) {
        // 残りの枠があれば、同一セクションの異なるチャンクも追加
        for (const result of results) {
            if (finalResults.length >= targetLimit) break;
            
            const isDuplicate = finalResults.some(fr => 
                fr.filename === result.filename && 
                fr.section === result.section && 
                fr.chunk_index === result.chunk_index
            );
            
            if (!isDuplicate) {
                finalResults.push(result);
            }
        }
    }
    
    return finalResults.slice(0, targetLimit);
}

// ファイル全体の処理とベクトル化（改善版）
export async function processFileWithImprovedChunking(
    file: File,
    embedFunction: (text: string) => Promise<number[]>,
    options: {
        maxChunkSize?: number;
        overlapSize?: number;
        useSemanticSplit?: boolean;
        batchSize?: number;
    } = {}
): Promise<{
    totalChunks: number;
    totalProcessingTime: number;
    chunkStats: {
        averageSize: number;
        minSize: number;
        maxSize: number;
        withOverlap: number;
    };
}> {
    const {
        maxChunkSize = 1000,
        overlapSize = Math.floor(maxChunkSize * 0.2),
        useSemanticSplit = true,
        batchSize = 10
    } = options;

    const startTime = Date.now();
    console.log(`ファイル処理開始: ${file.name}`);

    // 改善されたチャンキング設定
    const chunkingOptions = {
        maxChunkSize,
        overlapSize,
        minChunkSize: Math.floor(maxChunkSize * 0.3),
        useSemanticSplit,
        preserveContext: true
    };

    // ファイルをチャンクに分割
    const chunks = await chunkFile(file, maxChunkSize, chunkingOptions);
    console.log(`チャンク分割完了: ${chunks.length}個のチャンク`);    // 統計情報収集
    const chunkSizes = chunks.map((c: ChunkData) => c.content.length);
    const chunkStats = {
        averageSize: Math.round(chunkSizes.reduce((sum: number, size: number) => sum + size, 0) / chunkSizes.length),
        minSize: Math.min(...chunkSizes),
        maxSize: Math.max(...chunkSizes),
        withOverlap: 0 // この値は実際のオーバーラップ数に基づいて更新される
    };

    // バッチ処理でベクトル化と保存
    const batchChunks: Array<{
        content: string;
        embedding: number[];
        filename?: string;
        section?: string;
        sectionSequence?: number;
        chunkIndex?: number;
        hasOverlap?: boolean;
        contextSize?: number;
    }> = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        console.log(`バッチ処理中: ${i + 1}-${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);

        // 各チャンクのベクトル化
        for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];
            const embedding = await embedFunction(chunk.content);
            
            // オーバーラップ情報の判定（前後のチャンクとの関連性チェック）
            const hasOverlap = i + j > 0 && 
                chunk.section === chunks[i + j - 1]?.section &&
                chunk.content.length > chunkingOptions.minChunkSize;
            
            if (hasOverlap) {
                chunkStats.withOverlap++;
            }

            batchChunks.push({
                content: chunk.content,
                embedding,
                filename: chunk.filename,
                section: chunk.section,
                sectionSequence: i + j,
                chunkIndex: i + j,
                hasOverlap,
                contextSize: chunk.content.length
            });
        }

        // バッチが満杯になったら挿入
        if (batchChunks.length >= batchSize) {
            await insertMemoryBatch(batchChunks);
            batchChunks.length = 0; // 配列をクリア
        }
    }

    // 残りのバッチを挿入
    if (batchChunks.length > 0) {
        await insertMemoryBatch(batchChunks);
    }

    const totalProcessingTime = Date.now() - startTime;
    console.log(`ファイル処理完了: ${totalProcessingTime}ms`);

    return {
        totalChunks: chunks.length,
        totalProcessingTime,
        chunkStats
    };
}


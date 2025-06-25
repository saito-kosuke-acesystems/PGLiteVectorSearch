import { PGlite } from "@electric-sql/pglite";
// @ts-ignore MEMO:型エラーが発生するのでignoreしておく tsconfig.jsonを修正する必要がある？
import { vector } from "@electric-sql/pglite/vector";

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
  // 検索用 memory テーブルを定義（chunkMd最適化版）
  // MEMO：vectorの次元数はモデルに依存する為、使用するモデルに合わせて変える事  
  await pglite.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id SERIAL PRIMARY KEY,
    filename TEXT,
    section TEXT,
    section_sequence INTEGER,
    content TEXT NOT NULL,
    embedding vector('${dimension}'),
    -- chunkMd情報の追加
    heading_level INTEGER,           -- 見出しレベル（1-6）
    heading_path TEXT[],            -- 階層パス配列
    heading_text TEXT,              -- 現在の見出しテキスト
    chunk_part_number INTEGER,      -- チャンクのパート番号（分割された場合）
    total_chunk_parts INTEGER,      -- 総チャンク数（分割された場合）
    has_overlap BOOLEAN DEFAULT false, -- オーバーラップコンテキストを含むか
    parent_section_id INTEGER,      -- 親セクションのID（階層関係）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  
  -- インデックス作成
  CREATE INDEX ON memory USING hnsw (embedding vector_cosine_ops);
  CREATE INDEX ON memory (filename);
  CREATE INDEX ON memory (heading_level);
  CREATE INDEX ON memory (heading_path);
  CREATE INDEX ON memory (section_sequence);
  CREATE INDEX ON memory (parent_section_id);`);

}

// chunkMd情報を含む拡張insertMemory関数
export async function insertMemory(
  content: string,
  embedding: number[],
  filename?: string,
  section?: string,
  sectionSequence?: number,
  headingLevel?: number,
  headingPath?: string[],
  headingText?: string,
  chunkPartNumber?: number,
  totalChunkParts?: number,
  hasOverlap?: boolean,
  parentSectionId?: number
) {
  const vec = JSON.stringify(embedding);

  // エスケープ処理
  const safeContent = content.replace(/'/g, "''");
  const safeVec = vec.replace(/'/g, "''");
  const safeFilename = filename ? `'${filename.replace(/'/g, "''")}'` : 'NULL';
  const safeSection = section ? `'${section.replace(/'/g, "''")}'` : 'NULL';
  const safeSectionSequence = sectionSequence !== undefined ? sectionSequence : 'NULL';
  const safeHeadingLevel = headingLevel !== undefined ? headingLevel : 'NULL';
  const safeHeadingPath = headingPath && headingPath.length > 0
    ? `ARRAY[${headingPath.filter(p => p != null).map(p => `'${String(p).replace(/'/g, "''")}'`).join(',')}]`
    : 'NULL';
  const safeHeadingText = headingText ? `'${headingText.replace(/'/g, "''")}'` : 'NULL';
  const safeChunkPartNumber = chunkPartNumber !== undefined ? chunkPartNumber : 'NULL';
  const safeTotalChunkParts = totalChunkParts !== undefined ? totalChunkParts : 'NULL';
  const safeHasOverlap = hasOverlap !== undefined ? hasOverlap : 'false';
  const safeParentSectionId = parentSectionId !== undefined ? parentSectionId : 'NULL';

  // 高速化の為awaitしない なんかあったら戻す
  pglite.exec(`
    INSERT INTO memory (
      filename, section, section_sequence, content, embedding,
      heading_level, heading_path, heading_text, 
      chunk_part_number, total_chunk_parts, has_overlap, parent_section_id
    ) VALUES (
      ${safeFilename}, ${safeSection}, ${safeSectionSequence}, '${safeContent}', '${safeVec}',
      ${safeHeadingLevel}, ${safeHeadingPath}, ${safeHeadingText},
      ${safeChunkPartNumber}, ${safeTotalChunkParts}, ${safeHasOverlap}, ${safeParentSectionId}
    )`);
}

export async function searchMemory(embedding: number[], limit: number = 3): Promise<any[]> {
  const vec = JSON.stringify(embedding);
  const threshold = 0.4;  // 距離の閾値

  // 重複排除を含む純粋なベクトル検索
  const result = await pglite.query(`
    WITH ranked_results AS (
      SELECT 
        id,
        filename,
        section,
        section_sequence,
        content,
        embedding,
        heading_level,
        heading_path,
        heading_text,
        chunk_part_number,
        total_chunk_parts,
        has_overlap,
        parent_section_id,
        (embedding <=> '${vec}') AS base_distance,
        (embedding <=> '${vec}') AS final_score -- ベース距離をそのままスコアとして使用
      FROM memory
      WHERE (embedding <=> '${vec}') < ${threshold}
    ),
    deduplicated_results AS (
      SELECT DISTINCT ON (filename, heading_path, heading_text)
        id,
        filename,
        section,
        section_sequence,
        content,
        embedding,
        heading_level,
        heading_path,
        heading_text,
        chunk_part_number,
        total_chunk_parts,
        has_overlap,
        parent_section_id,
        base_distance,
        final_score
      FROM ranked_results
      ORDER BY filename, heading_path, heading_text, final_score ASC
    )
    SELECT 
      id,
      filename,
      section,
      section_sequence,
      content,
      base_distance,
      final_score,
      heading_level,
      heading_path,
      heading_text,
      chunk_part_number,
      total_chunk_parts,
      has_overlap
    FROM deduplicated_results
    ORDER BY final_score ASC
    LIMIT ${limit * 2};`);

  // チャンクパーツを統合せずに結果を返す
  //return result.rows;

  // 結果の後処理：関連するチャンクパーツの統合
  const processedResults = await enhanceResultsWithContext(result.rows, limit);

  return processedResults;
}

// 検索結果にコンテキスト情報を追加する関数
async function enhanceResultsWithContext(results: any[], limit: number): Promise<any[]> {
  const enhancedResults = [];
  const processedSections = new Set();

  for (const result of results) {
    const sectionKey = `${result.filename}-${result.heading_path?.join('/')}-${result.heading_text}`;

    // 既に処理済みのセクションはスキップ
    if (processedSections.has(sectionKey)) {
      continue;
    }

    processedSections.add(sectionKey);

    // 分割されたチャンクの場合、関連パーツを取得
    if (result.total_chunk_parts > 1) {
      const relatedParts = await getRelatedChunkParts(
        result.filename,
        result.heading_path,
        result.heading_text
      );

      // パーツを統合したコンテンツを作成
      const integratedContent = integrateChunkParts(relatedParts);

      enhancedResults.push({
        ...result,
        content: integratedContent,
        integration_info: {
          total_parts: result.total_chunk_parts,
          integrated_parts: relatedParts.length,
          has_full_context: relatedParts.length === result.total_chunk_parts
        }
      });
    } else {
      enhancedResults.push(result);
    }

    // 指定された制限に達したら終了
    if (enhancedResults.length >= limit) {
      break;
    }
  }

  return enhancedResults;
}

// 関連するチャンクパーツを取得する関数
async function getRelatedChunkParts(filename: string, headingPath: string[], headingText: string): Promise<any[]> {
  const safeFilename = filename.replace(/'/g, "''");
  const safeHeadingText = headingText ? `'${headingText.replace(/'/g, "''")}'` : 'NULL';

  // heading_pathがNULLまたは空配列の場合とそうでない場合で条件を分ける
  let headingPathCondition = '';
  if (!headingPath || headingPath.length === 0) {
    headingPathCondition = 'heading_path IS NULL';
  } else {
    const safeHeadingPath = `ARRAY[${headingPath.map(p => `'${String(p).replace(/'/g, "''")}'`).join(',')}]`;
    headingPathCondition = `heading_path = ${safeHeadingPath}`;
  }

  // heading_textのNULL比較も修正
  let headingTextCondition = '';
  if (!headingText) {
    headingTextCondition = 'heading_text IS NULL';
  } else {
    headingTextCondition = `heading_text = ${safeHeadingText}`;
  }

  const result = await pglite.query(`
    SELECT id, content, chunk_part_number, total_chunk_parts, has_overlap
    FROM memory
    WHERE filename = '${safeFilename}'
      AND ${headingPathCondition}
      AND ${headingTextCondition}
    ORDER BY chunk_part_number ASC;
  `);

  return result.rows;
}

// チャンクパーツを統合する関数
function integrateChunkParts(parts: any[]): string {
  if (parts.length <= 1) {
    return parts[0]?.content || '';
  }

  let integratedContent = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let partContent = part.content;

    // オーバーラップ部分の重複を除去
    if (i > 0 && part.has_overlap) {
      // 前のパーツとの重複部分を検出して除去
      partContent = removeOverlapWithPrevious(partContent, integratedContent);
    }

    // パーツを統合
    if (i === 0) {
      integratedContent = partContent;
    } else {
      integratedContent += '\n\n' + partContent;
    }
  }

  return integratedContent;
}

// オーバーラップ部分を除去する関数
function removeOverlapWithPrevious(currentContent: string, previousContent: string): string {
  if (!previousContent || !currentContent) {
    return currentContent;
  }

  // 前のコンテンツの末尾と現在のコンテンツの先頭で重複を検出
  const overlap = findOverlapBetweenTexts(previousContent, currentContent);

  if (overlap.length > 0) {
    // 重複部分を除去
    return currentContent.substring(overlap.length).trim();
  }

  return currentContent;
}

// 2つのテキスト間のオーバーラップを検出する関数（マーカーベース）
function findOverlapBetweenTexts(previousText: string, currentText: string): string {
  if (!previousText || !currentText) {
    return '';
  }

  // 現在のテキストが「...」マーカーで始まっているかチェック
  const overlapMarkerRegex = /^\.{3,}\s*/;
  const markerMatch = currentText.match(overlapMarkerRegex);
  
  if (!markerMatch) {
    // マーカーがない場合は重複なしとして処理
    return '';
  }

  // マーカー部分の長さを取得
  const markerLength = markerMatch[0].length;
  
  // マーカー後のコンテンツを取得
  const contentAfterMarker = currentText.substring(markerLength).trim();
  
  // マーカー後のコンテンツが空の場合は重複なしとして処理
  if (!contentAfterMarker) {
    return '';
  }

  // 前のテキストの末尾部分で、マーカー後のコンテンツと一致する部分を検索
  const maxSearchLength = Math.min(500, previousText.length); // 検索範囲を拡大
  const searchText = previousText.slice(-maxSearchLength);
  
  // マーカー後のコンテンツの最初の文または最初の50文字を取得して一致を確認
  const firstSentence = contentAfterMarker.split(/[。！？.!?]/)[0];
  const searchPattern = firstSentence.length > 50 
    ? firstSentence.substring(0, 50)
    : firstSentence;
  
  // 前のテキストに同じ内容が含まれているかチェック
  if (searchText.includes(searchPattern)) {
    // 重複として、マーカーから最初の文までを返す
    const firstSentenceEnd = contentAfterMarker.indexOf(firstSentence) + firstSentence.length;
    const overlapEnd = Math.min(firstSentenceEnd + 1, contentAfterMarker.length); // 句読点も含める
    
    return currentText.substring(0, markerLength + overlapEnd);
  }

  // 重複が確認できない場合はマーカー部分のみを重複として扱う
  return currentText.substring(0, markerLength);
}

// // ハイブリッド検索（β）
// export async function hybridSearchMemory(keywords: string | string[], embedding: number[], limit: number = 3): Promise<any[]> {
//   const vec = JSON.stringify(embedding);
//   const vectorWeight = 0.5; // ベクトル検索の重み
//   const keywordWeight = 0.4; // キーワード検索の重み
//   const maxKeywordScore = 1.0; // キーワードスコアの最大値
//   const minCombinedScore = 0.3; // 最小結合スコア
//   // キーワードの処理
//   let keywordConditions = [];
//   let keywordScoreExpression = "";
//   let keywordCondition = "";

//   if (Array.isArray(keywords)) {
//     // 空の配列または空文字のみの配列の場合は特殊処理
//     if (keywords.length === 0 || keywords.every(k => k.trim() === '')) {
//       return searchMemory(embedding, limit);
//     }
//     // 有効なキーワードのみをフィルタリングし、重複を除去
//     const validKeywords = Array.from(new Set(keywords.filter(k => k.trim() !== '').map(k => k.trim().toLowerCase())));

//     // 各キーワードの存在をチェックする式を作成（0または1の値）
//     keywordConditions = validKeywords.map(k => {
//       const safeKeyword = k.replace(/'/g, "''");
//       return `CASE WHEN LOWER(content) LIKE '%${safeKeyword}%' THEN 1 ELSE 0 END`;
//     });

//     if (keywordConditions.length === 0) {
//       return searchMemory(embedding, limit);
//     }

//     // WHERE句用の条件
//     const whereConditions = validKeywords.map(k =>
//       `content ILIKE '%${k.replace(/'/g, "''")}%'`
//     );
//     keywordCondition = whereConditions.join(' OR ');

//     // キーワードスコア計算式（マッチしたキーワード数に基づく、重複なし）
//     keywordScoreExpression = `LEAST((${keywordConditions.join(' + ')}) * ${keywordWeight} / ${validKeywords.length}, ${maxKeywordScore})`;
//   } else {
//     // 文字列の場合
//     const safeKeyword = keywords.replace(/'/g, "''").trim().toLowerCase();
//     if (safeKeyword === '') {
//       return searchMemory(embedding, limit);
//     }

//     keywordCondition = `content ILIKE '%${safeKeyword}%'`;

//     // 存在ベースのスコア計算（0または1）
//     keywordScoreExpression = `CASE WHEN LOWER(content) LIKE '%${safeKeyword}%' THEN ${keywordWeight} ELSE 0 END`;
//   }
//   // スコア計算式を変数として定義
//   const combinedScoreExpression = `
//     CASE
//       WHEN ${keywordCondition} THEN ${keywordScoreExpression}
//       ELSE 0
//     END +
//     (${vectorWeight} * (1 - (embedding <=> '${vec}')))
//   `;  const result = await pglite.query(`
//     WITH scored_results AS (
//       SELECT
//         id,
//         filename,
//         section,
//         section_sequence,
//         content,
//         (embedding <=> '${vec}') AS vector_distance,
//         ${combinedScoreExpression} AS combined_score
//       FROM memory
//     )
//     SELECT id, filename, section, section_sequence, content, vector_distance, combined_score
//     FROM scored_results
//     WHERE combined_score >= ${minCombinedScore}
//     ORDER BY combined_score DESC
//     LIMIT ${limit};
//   `);
//   return result.rows;
// }


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
  // 検索用 memory テーブルを定義
  // MEMO：vectorの次元数はモデルに依存する為、使用するモデルに合わせて変える事
  await pglite.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id SERIAL PRIMARY KEY,
    filename TEXT,
    section TEXT,
    content TEXT NOT NULL,
    embedding vector('${dimension}')
  );
  CREATE INDEX ON memory USING hnsw (embedding vector_cosine_ops);`);

}

export async function insertMemory(content: string, embedding: number[], filename?: string, section?: string) {
  const vec = JSON.stringify(embedding);
  // エスケープ処理
  const safeContent = content.replace(/'/g, "''");
  const safeVec = vec.replace(/'/g, "''");
  const safeFilename = filename ? filename.replace(/'/g, "''") : null;
  const safeSection = section ? section.replace(/'/g, "''") : null;

  // 高速化の為awaitしない なんかあったら戻す
  pglite.exec(
    `INSERT INTO memory (filename, section, content, embedding) VALUES ('${safeFilename}', '${safeSection}', '${safeContent}', '${safeVec}')`);
}

export async function searchMemory(embedding: number[], limit: number = 3): Promise<any[]> {
  const vec = JSON.stringify(embedding);
  const threshold = 0.3;  // 距離の閾値
  const result = await pglite.query(`
    SELECT id, filename, section, content, embedding, (embedding <=> '${vec}') AS distance
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
  const result = await pglite.query(`
    WITH scored_results AS (
      SELECT 
        id, 
        filename,
        section,
        content,
        (embedding <=> '${vec}') AS vector_distance,
        ${combinedScoreExpression} AS combined_score
      FROM memory
    )
    SELECT id, filename, section, content, vector_distance, combined_score
    FROM scored_results
    WHERE combined_score >= ${minCombinedScore}
    ORDER BY combined_score DESC
    LIMIT ${limit};
  `);
  return result.rows;
}


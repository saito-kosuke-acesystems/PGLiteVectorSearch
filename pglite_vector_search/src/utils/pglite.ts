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
    content TEXT NOT NULL,
    embedding vector('${dimension}')
  );
  CREATE INDEX ON memory USING hnsw (embedding vector_cosine_ops);`);

}

export async function insertMemory(content: string, embedding: number[]) {
  const vec = JSON.stringify(embedding);
  // contentとvecをエスケープ
  const safeContent = content.replace(/'/g, "''");
  const safeVec = vec.replace(/'/g, "''");
  // 高速化の為awaitしない なんかあったら戻す
  pglite.exec(
    `INSERT INTO memory (content, embedding) VALUES ('${safeContent}', '${safeVec}')`);
}

export async function searchMemory(embedding: number[], limit: number = 2): Promise<any[]> {
  const vec = JSON.stringify(embedding);
  const threshold = 0.3;  // 距離の閾値
  const result = await pglite.query(`
    SELECT id, content, embedding, (embedding <=> '${vec}') AS distance
    FROM memory
    WHERE (embedding <=> '${vec}') < ${threshold}
    ORDER BY distance
    LIMIT ${limit};`);
  return result.rows;
}

// ハイブリッド検索（β）
export async function hybridSearchMemory(keywords: string | string[], embedding: number[], limit: number = 2): Promise<any[]> {
  const vec = JSON.stringify(embedding);
  const vectorWeight = 0.5; // ベクトル検索の重み
  const keywordWeight = 0.4; // キーワード検索の重み
  const maxKeywordScore = 1.0; // キーワードスコアの最大値
  const minCombinedScore = 0.4; // 最小結合スコア

  // キーワードの処理
  let keywordConditions = [];
  let keywordScoreExpression = "";
  let keywordCondition = "";
  
  if (Array.isArray(keywords)) {
    // 空の配列または空文字のみの配列の場合は特殊処理
    if (keywords.length === 0 || keywords.every(k => k.trim() === '')) {
      return searchMemory(embedding, limit);
    }
    
    // 有効なキーワードのみをフィルタリング
    const validKeywords = keywords.filter(k => k.trim() !== '');
    
    // 各キーワードの出現回数をカウントする式を作成
    keywordConditions = validKeywords.map(k => {
      const safeKeyword = k.replace(/'/g, "''");
      return `(LENGTH(content) - LENGTH(REPLACE(LOWER(content), LOWER('${safeKeyword}'), ''))) / LENGTH('${safeKeyword}')`;
    });
    
    if (keywordConditions.length === 0) {
      return searchMemory(embedding, limit);
    }
    
    // WHERE句用の条件
    const whereConditions = validKeywords.map(k => 
      `content ILIKE '%${k.replace(/'/g, "''")}%'`
    );
    keywordCondition = whereConditions.join(' OR ');
    
    // キーワードスコア計算式（出現回数の合計に基づく）
    keywordScoreExpression = `LEAST((${keywordConditions.join(' + ')}) * ${keywordWeight} / ${validKeywords.length}, ${maxKeywordScore})`;
  } else {
    // 文字列の場合
    const safeKeyword = keywords.replace(/'/g, "''").trim();
    if (safeKeyword === '') {
      return searchMemory(embedding, limit);
    }
    
    keywordCondition = `content ILIKE '%${safeKeyword}%'`;
    
    // 出現回数に基づくスコア計算
    keywordScoreExpression = `LEAST((LENGTH(content) - LENGTH(REPLACE(LOWER(content), LOWER('${safeKeyword}'), ''))) / LENGTH('${safeKeyword}') * ${keywordWeight}, ${maxKeywordScore})`;
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
        content,
        ${combinedScoreExpression} AS combined_score
      FROM memory
    )
    SELECT id, content, combined_score
    FROM scored_results
    WHERE combined_score >= ${minCombinedScore}
    ORDER BY combined_score DESC
    LIMIT ${limit};
  `);
  return result.rows;
}


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
  await pglite.exec(
    `INSERT INTO memory (content, embedding) VALUES ('${safeContent}', '${safeVec}')`);
}

export async function searchMemory(embedding: number[], limit: number = 3): Promise<any[]> {
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
export async function hybridSearchMemory(keywords: string | string[], embedding: number[], limit: number = 3): Promise<any[]> {
  const vec = JSON.stringify(embedding);
  const threshold = 0.3;  // 距離の閾値
  const vectorWeight = 0.7; // ベクトル検索の重み（0.0〜1.0）
  const keywordWeight = 0.3; // キーワード検索の重み

  // キーワードの処理
  let keywordCondition = "";
  if (Array.isArray(keywords)) {
    // 空の配列または空文字のみの配列の場合は特殊処理
    if (keywords.length === 0 || keywords.every(k => k.trim() === '')) {
      // キーワードがない場合はベクトル検索のみを実行
      return searchMemory(embedding, limit);
    }
    
    // 配列の場合は各キーワードをエスケープして OR 条件で結合
    const safeKeywords = keywords
      .filter(k => k.trim() !== '')
      .map(k => `content ILIKE '%${k.replace(/'/g, "''")}%'`);
    
    keywordCondition = safeKeywords.join(' OR ');
  } else {
    // 文字列の場合はそのままエスケープ
    const safeKeyword = keywords.replace(/'/g, "''").trim();
    if (safeKeyword === '') {
      // キーワードが空の場合はベクトル検索のみを実行
      return searchMemory(embedding, limit);
    }
    keywordCondition = `content ILIKE '%${safeKeyword}%'`;
  }

  const result = await pglite.query(`
    SELECT 
      id, 
      content,
      CASE
        WHEN ${keywordCondition} THEN ${keywordWeight}
        ELSE 0
      END + 
      (${vectorWeight} * (1 - (embedding <=> '${vec}'))) AS combined_score
    FROM memory
    WHERE ${keywordCondition} OR (embedding <=> '${vec}') < ${threshold}
    ORDER BY combined_score DESC
    LIMIT ${limit};
  `);
  return result.rows;
}


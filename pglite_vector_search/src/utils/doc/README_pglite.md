# PGLite Vector Search Implementation Documentation

## 概要

このドキュメントは、PGLiteを使用したベクトル検索システムの実装について説明します。本システムは、テキストドキュメントを階層構造付きのチャンクに分割し、ベクトル埋め込みを使用して高精度な意味検索を提供します。

## アーキテクチャ

### 主要コンポーネント

1. **PGLite Database**: インメモリPostgreSQL データベース
2. **pgvector Extension**: ベクトル演算とHNSWインデックスのサポート
3. **Memory Table**: ドキュメントチャンクとメタデータの格納
4. **Vector Search Engine**: 階層重み付けとコンテキスト統合機能

## データベース設計

### Memory テーブル構造

```sql
CREATE TABLE memory (
    id SERIAL PRIMARY KEY,
    filename TEXT,                    -- ファイル名
    section TEXT,                     -- セクション名
    section_sequence INTEGER,         -- セクション順序
    content TEXT NOT NULL,            -- チャンク内容
    embedding vector(dimension),      -- ベクトル埋め込み
    
    -- 階層構造メタデータ
    heading_level INTEGER,            -- 見出しレベル（1-6）
    heading_path TEXT[],             -- 階層パス配列
    heading_text TEXT,               -- 現在の見出しテキスト
    
    -- チャンク分割メタデータ
    chunk_part_number INTEGER,       -- チャンクのパート番号
    total_chunk_parts INTEGER,       -- 総チャンク数
    has_overlap BOOLEAN,             -- オーバーラップフラグ
    
    -- 関係性メタデータ
    parent_section_id INTEGER,       -- 親セクションID
    
    -- タイムスタンプ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### インデックス設計

```sql
-- ベクトル検索用HNSWインデックス（コサイン類似度）
CREATE INDEX ON memory USING hnsw (embedding vector_cosine_ops);

-- メタデータ検索用インデックス
CREATE INDEX ON memory (filename);
CREATE INDEX ON memory (heading_level);
CREATE INDEX ON memory (heading_path);
CREATE INDEX ON memory (section_sequence);
CREATE INDEX ON memory (parent_section_id);
```

## 主要関数

### 1. initMemory(dimension: number)

**用途**: データベースとテーブルの初期化

**パラメータ**:
- `dimension`: ベクトルの次元数（使用する埋め込みモデルに依存）

**処理**:
1. pgvector拡張の有効化
2. memoryテーブルの作成
3. 検索用インデックスの作成

### 2. insertMemory()

**用途**: ドキュメントチャンクの挿入

**パラメータ**:
- `content`: チャンク内容
- `embedding`: ベクトル埋め込み
- `filename`: ファイル名（オプション）
- `section`: セクション名（オプション）
- `sectionSequence`: セクション順序（オプション）
- `headingLevel`: 見出しレベル（オプション）
- `headingPath`: 階層パス（オプション）
- `headingText`: 見出しテキスト（オプション）
- `chunkPartNumber`: チャンクパート番号（オプション）
- `totalChunkParts`: 総チャンク数（オプション）
- `hasOverlap`: オーバーラップフラグ（オプション）
- `parentSectionId`: 親セクションID（オプション）

**特徴**:
- SQLインジェクション対策のエスケープ処理
- 非同期処理による高速挿入

### 3. searchMemory(embedding: number[], limit: number)

**用途**: 高精度ベクトル検索

**パラメータ**:
- `embedding`: 検索クエリのベクトル埋め込み
- `limit`: 結果件数制限（デフォルト: 3）

**検索アルゴリズム**:

#### ステップ1: 基本ベクトル検索
```sql
SELECT *, (embedding <=> query_vector) AS base_distance
FROM memory
WHERE (embedding <=> query_vector) < threshold
```

#### ステップ2: 階層重み付け
```sql
CASE 
  WHEN heading_level = 1 THEN 0.9    -- # 見出し（最重要）
  WHEN heading_level = 2 THEN 0.95   -- ## 見出し
  WHEN heading_level = 3 THEN 0.97   -- ### 見出し
  WHEN heading_level >= 4 THEN 0.98  -- #### 以下
  ELSE 1.0                           -- 見出しなし
END AS hierarchy_weight
```

#### ステップ3: コンテキスト重み付け
```sql
-- オーバーラップボーナス
CASE WHEN has_overlap = true THEN 0.95 ELSE 1.0 END AS overlap_weight

-- チャンク統合スコア
CASE 
  WHEN chunk_part_number = 1 THEN 0.9
  WHEN chunk_part_number IS NULL THEN 0.95
  ELSE 1.0 + (chunk_part_number * 0.02)
END AS chunk_weight
```

#### ステップ4: 最終スコア計算
```sql
final_score = base_distance * hierarchy_weight * overlap_weight * chunk_weight
```

#### ステップ5: 重複排除と結果統合
- 同一セクションの重複を排除
- 分割されたチャンクの情報統合
- コンテキスト情報の追加

## 高度な機能

### 1. チャンクパーツ統合

分割されたチャンクを自動的に統合し、完全なコンテキストを提供：

```typescript
// 関連パーツの取得
const relatedParts = await getRelatedChunkParts(filename, headingPath, headingText);

// パーツの統合とオーバーラップ除去
const integratedContent = integrateChunkParts(relatedParts);
```

### 2. オーバーラップ除去

チャンク間の重複コンテンツを自動検出・除去：

```typescript
function removeOverlapWithPrevious(currentContent: string, previousContent: string): string {
  const overlap = findOverlapBetweenTexts(previousContent, currentContent);
  if (overlap.length > 0) {
    return currentContent.substring(overlap.length).trim();
  }
  return currentContent;
}
```

### 3. テキスト類似度計算

Jaccard係数ベースの類似度計算：

```typescript
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));
  
  const intersection = Array.from(words1).filter(word => words2.has(word));
  const union = new Set([...words1, ...words2]);
  
  return intersection.length / union.size;
}
```

## パフォーマンス最適化

### 1. インデックス戦略
- **HNSWインデックス**: ベクトル検索の高速化
- **複合インデックス**: メタデータ検索の最適化

### 2. 非同期処理
- データ挿入時の非await処理による高速化
- バッチ処理対応

### 3. メモリ効率
- インメモリデータベースによる高速アクセス
- 効率的なベクトル格納

## 使用例

### 基本的な使用フロー

```typescript
// 1. データベース初期化
await initMemory(1536); // OpenAI embedding dimension

// 2. ドキュメントチャンクの挿入
await insertMemory(
  "ドキュメント内容",
  embeddingVector,
  "document.md",
  "セクション1",
  1,
  1,               // heading_level
  ["セクション1"], // heading_path
  "セクション1",   // heading_text
  1,               // chunk_part_number
  1,               // total_chunk_parts
  false,           // has_overlap
  null             // parent_section_id
);

// 3. ベクトル検索
const results = await searchMemory(queryEmbedding, 5);
```

### 検索結果の構造

```typescript
interface SearchResult {
  id: number;
  filename: string;
  section: string;
  content: string;
  base_distance: number;
  final_score: number;
  heading_level: number;
  heading_path: string[];
  heading_text: string;
  chunk_part_number: number;
  total_chunk_parts: number;
  has_overlap: boolean;
  integration_info?: {
    total_parts: number;
    integrated_parts: number;
    has_full_context: boolean;
  };
}
```

## 設定パラメータ

### 検索関連
- `threshold`: 距離の閾値（デフォルト: 0.4）
- `hierarchy_weight`: 階層レベル重み（0.9-1.0）
- `overlap_weight`: オーバーラップ重み（0.95）
- `chunk_weight`: チャンク重み（0.9-1.02）

### チャンク統合関連
- `maxOverlapLength`: 最大オーバーラップ長（200文字）
- `similarityThreshold`: 類似度閾値（0.8）

## エラーハンドリング

### SQLインジェクション対策
```typescript
const safeContent = content.replace(/'/g, "''");
const safeFilename = filename ? `'${filename.replace(/'/g, "''")}'` : 'NULL';
```

### NULL値処理
```typescript
const safeHeadingPath = headingPath && headingPath.length > 0
  ? `ARRAY[${headingPath.filter(p => p != null).map(p => `'${String(p).replace(/'/g, "''")}'`).join(',')}]`
  : 'NULL';
```

## 今後の拡張可能性

### 1. ハイブリッド検索
- キーワード検索とベクトル検索の組み合わせ
- 重み付け調整による精度向上

### 2. リアルタイム更新
- ドキュメント更新時の差分処理
- インクリメンタルインデックス更新

### 3. 分散処理
- 大規模データセット対応
- 分散ベクトルインデックス

## まとめ

本実装は、階層構造を考慮した高精度なベクトル検索システムを提供します。チャンク分割、オーバーラップ処理、コンテキスト統合などの高度な機能により、従来のベクトル検索システムを大幅に上回る検索精度を実現しています。

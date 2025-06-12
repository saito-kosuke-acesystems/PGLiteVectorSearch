import TinySegmenter from 'tiny-segmenter';

/**
 * 日本語テキストをキーワードに分割し、検索に適したキーワードを抽出する
 * @param text 分析対象のテキスト
 * @returns 検索に適したキーワードの配列
 */
export function extractKeywords(text: string): string[] {
  // 1. 不要な文字を削除
  const cleanedText = text
    .replace(/[「」『』()（）【】［］[\]/.,、。！？!?]/g, ' ')
    .trim();
  
  // 2. TinySegmenterによる分かち書き
  const segmenter = new TinySegmenter();
  const segments = segmenter.segment(cleanedText);

  // 5. 重複を除去
  return Array.from(new Set(segments));
  
//   // 3. ストップワード（検索に適さない単語）のリスト
//   const stopWords = [
//     'は', 'を', 'に', 'の', 'が', 'で', 'と', 'も', 'へ', 'や',
//     'から', 'より', 'など', 'について', 'による', 'ための',
//     'です', 'ます', 'でした', 'ました', 'である', 'だ', 'った',
//     'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'どの',
//     'どう', 'どういう', 'どんな', 'なに', '何', 'いつ', 'どこ',
//     'ある', 'いる', 'する', 'なる', 'できる'
//   ];
  
//   // 4. フィルタリング条件
//   // - 長さ1の単語を除外
//   // - ストップワードを除外
//   // - ひらがなのみの単語を除外（オプション）
//   const hiraganaOnlyPattern = /^[\u3040-\u309F]+$/;
  
//   const keywords = segments.filter(word => {
//     return word.length > 1 && 
//            !stopWords.includes(word) &&
//            !hiraganaOnlyPattern.test(word);
//   });
  
//   // 5. 重複を除去
//   return Array.from(new Set(keywords));
}
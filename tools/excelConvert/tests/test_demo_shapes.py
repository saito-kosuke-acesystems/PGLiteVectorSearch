"""
図形のデモとテスト用機能
"""
import os
import sys

# プロジェクトルートをPythonパスに追加
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from tools.excelConvert.logics.excelToHtmlLogic import excel_to_html

def create_mock_shapes_for_demo():
    """デモ用のモック図形を作成してHTMLに追加"""
    
    # サンプル図形を作成
    mock_shapes = [
        {
            'type': 'textbox',
            'text': '1.2. 処理フロー',
            'col': 1,  # B列の位置
            'row': 7,  # 8行目の位置
            'col_offset': 0,
            'row_offset': 0,
            'to_col': 3,  # D列まで
            'to_row': 8,  # 9行目まで
            'to_col_offset': 0,
            'to_row_offset': 0,
            'style': {
                'fill_color': '#E6F3FF',
                'border_color': '#0066CC',
                'border_width': 2,
                'font_size': 12,
                'font_color': '#000080'
            }
        },
        {
            'type': 'shape',
            'shape_type': 'rectangle',
            'text': 'クエリーパラメータ',
            'col': 3,  # D列の位置
            'row': 10,  # 11行目の位置
            'col_offset': 0,
            'row_offset': 0,
            'to_col': 5,  # F列まで
            'to_row': 11,  # 12行目まで
            'to_col_offset': 0,
            'to_row_offset': 0,
            'style': {
                'fill_color': '#F0F0F0',
                'border_color': '#808080',
                'border_width': 1,
                'font_size': 10,
                'font_color': '#333333'
            }
        },
        {
            'type': 'placeholder_image',
            'name': 'フローチャート画像',
            'col': 0,
            'row': 12,
            'col_offset': 0,
            'row_offset': 0,
            'width': 200,
            'height': 150
        }
    ]
    
    return mock_shapes

def inject_demo_shapes_into_logic():
    """メインロジックにデモ図形を注入"""
    import tools.excelConvert.logics.excelToHtmlLogic as main_logic
    
    # 元の関数をバックアップ
    original_get_sheet_shapes = main_logic.get_sheet_shapes
    
    def mock_get_sheet_shapes(worksheet):
        """モック図形を返す関数"""
        print("デモ用図形を生成中...")
        
        # 元の図形検出を試行
        original_shapes = original_get_sheet_shapes(worksheet)
        
        # デモ図形を追加
        demo_shapes = create_mock_shapes_for_demo()
        
        print(f"元の図形: {len(original_shapes)}個")
        print(f"デモ図形: {len(demo_shapes)}個")
        
        return original_shapes + demo_shapes
    
    # 関数を置き換え
    main_logic.get_sheet_shapes = mock_get_sheet_shapes
    
    print("デモ図形を注入しました")

def test_with_demo_shapes():
    """デモ図形を使ったテスト"""
    print("=== デモ図形を使った変換テスト ===")
    
    # デモ図形を注入
    inject_demo_shapes_into_logic()
    
    # 既存のExcelファイルを使用
    excel_file = "test_shapes_simple.xlsx"
    output_file = "demo_shapes_output.html"
    
    if not os.path.exists(excel_file):
        print(f"エラー: {excel_file} が見つかりません")
        return
    
    try:
        print(f"入力ファイル: {excel_file}")
        print(f"出力ファイル: {output_file}")
        
        # 変換実行
        excel_to_html(excel_file, output_file)
        
        print(f"変換完了: {output_file}")
        
        # HTMLファイルの内容をチェック
        with open(output_file, 'r', encoding='utf-8') as f:
            html_content = f.read()
            
        if 'excel-shape' in html_content:
            print("✓ HTMLに図形クラスが含まれています")
        else:
            print("✗ HTMLに図形クラスが含まれていません")
            
        if 'excel-textbox' in html_content:
            print("✓ HTMLにテキストボックスが含まれています")
        else:
            print("✗ HTMLにテキストボックスが含まれていません")
            
        if '1.2. 処理フロー' in html_content:
            print("✓ HTMLに期待されるテキストが含まれています")
        else:
            print("✗ HTMLに期待されるテキストが含まれていません")
        
        if 'クエリーパラメータ' in html_content:
            print("✓ HTMLにクエリーパラメータテキストが含まれています")
        else:
            print("✗ HTMLにクエリーパラメータテキストが含まれていません")
        
        # ブラウザで開く
        try:
            os.startfile(output_file)
        except:
            print("HTMLファイルを手動で開いてください。")
            
    except Exception as e:
        print(f"エラー: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_with_demo_shapes()

"""
図形付きExcelファイルのテストスクリプト
"""
import os
import sys

# プロジェクトルートをPythonパスに追加
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from tools.excelConvert.logics.excelToHtmlLogic import excel_to_html

def test_shapes_conversion():
    """図形変換のテスト"""
    print("=== Excel図形変換テスト ===")
    
    # テスト用のサンプルファイルがある場合
    sample_files = [
        r"c:\AceAI\OneDrive_1_2025-1-18\sample.xlsx",  # 適宜変更
        r"c:\github\PGLiteVectorSearch\tools\sample.xlsx",
        "sample.xlsx"
    ]
    
    excel_file = None
    for file_path in sample_files:
        if os.path.exists(file_path):
            excel_file = file_path
            break
    
    if not excel_file:
        print("テスト用のExcelファイルが見つかりません。")
        print("図形を含むExcelファイルを用意して、パスを指定してください。")
        return
    
    output_file = "test_shapes_output.html"
    
    try:
        print(f"入力ファイル: {excel_file}")
        print(f"出力ファイル: {output_file}")
        
        # 変換実行
        excel_to_html(excel_file, output_file)
        
        print(f"変換完了: {output_file}")
        
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
    test_shapes_conversion()

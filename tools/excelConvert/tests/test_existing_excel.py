"""
既存のExcelファイルの図形検出テスト
"""
import os
import sys

# プロジェクトルートをPythonパスに追加
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from tools.excelConvert.logics.excelToHtmlLogic import excel_to_html

def test_existing_excel():
    """既存のExcelファイルでテスト"""
    print("=== 既存Excelファイルでの図形検出テスト ===")
    
    # 可能性のあるファイルパス
    possible_files = [
        r"c:\AceAI\OneDrive_1_2025-1-18\システム機能設計書(Webサービス)_B10101_顧客検索.xlsx",
        r"c:\github\PGLiteVectorSearch\tools\excelConvert\logics\システム機能設計書(Webサービス)_B10101_顧客検索.html",
        r"c:\github\PGLiteVectorSearch\tools\excelConvert\システム機能設計書(Webサービス)_B10101_顧客検索.xlsx",
        r"システム機能設計書(Webサービス)_B10101_顧客検索.xlsx"
    ]
    
    excel_file = None
    for file_path in possible_files:
        if os.path.exists(file_path) and file_path.endswith('.xlsx'):
            excel_file = file_path
            break
    
    if not excel_file:
        print("図形を含む可能性のあるExcelファイルが見つかりません。")
        print("以下のディレクトリをチェックします：")
        
        # ディレクトリの内容をチェック
        check_dirs = [
            r"c:\AceAI\OneDrive_1_2025-1-18",
            r"c:\github\PGLiteVectorSearch\tools\excelConvert\logics",
            r"c:\github\PGLiteVectorSearch\tools\excelConvert",
            "."
        ]
        
        for dir_path in check_dirs:
            if os.path.exists(dir_path):
                print(f"\n{dir_path}:")
                try:
                    files = os.listdir(dir_path)
                    excel_files = [f for f in files if f.endswith(('.xlsx', '.xls'))]
                    if excel_files:
                        print(f"  Excelファイル: {excel_files}")
                        # 最初に見つかったExcelファイルを使用
                        excel_file = os.path.join(dir_path, excel_files[0])
                        break
                    else:
                        print("  Excelファイルなし")
                except Exception as e:
                    print(f"  エラー: {e}")
    
    if not excel_file:
        print("テスト用のExcelファイルが見つかりませんでした。")
        return
    
    output_file = "existing_excel_test.html"
    
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
            
        if 'data:image' in html_content:
            print("✓ HTMLに画像データが含まれています")
        else:
            print("✗ HTMLに画像データが含まれていません")
        
        if '<img class="excel-shape' in html_content:
            print("✓ HTMLに画像要素が含まれています")
        else:
            print("✗ HTMLに画像要素が含まれていません")
        
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
    test_existing_excel()

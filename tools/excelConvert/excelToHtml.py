import tkinter as tk
from tkinter import filedialog, messagebox
import os
import sys
import json
from pathlib import Path

# プロジェクトルートをPythonパスに追加
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# excelToHtmlモジュールをインポート
from tools.excelConvert.logics.excelToHtmlLogic import excel_to_html

# 設定ファイルのパス
CONFIG_FILE = "convert_config.json"

def load_config():
    """設定ファイルを読み込み"""
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {"last_input_dir": os.getcwd(), "last_output_dir": os.getcwd()}

def save_config(config):
    """設定ファイルを保存"""
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
    except:
        pass

def select_excel_file():
    """Excelファイル選択ダイアログを表示"""
    config = load_config()
    
    root = tk.Tk()
    root.withdraw()  # メインウィンドウを非表示
    
    # ファイル選択ダイアログ
    file_path = filedialog.askopenfilename(
        title="変換するExcelファイルを選択してください",
        filetypes=[
            ("Excelファイル", "*.xlsx *.xls"),
            ("Excel 2007以降", "*.xlsx"),
            ("Excel 97-2003", "*.xls"),
            ("すべてのファイル", "*.*")
        ],
        initialdir=config.get("last_input_dir", os.getcwd())
    )
    
    root.destroy()
    
    # 選択されたファイルのディレクトリを保存
    if file_path:
        config["last_input_dir"] = os.path.dirname(file_path)
        save_config(config)
    
    return file_path

def select_output_location(input_file_path):
    """出力先ファイル選択ダイアログを表示"""
    config = load_config()
    
    root = tk.Tk()
    root.withdraw()  # メインウィンドウを非表示
    
    # 入力ファイルと同じディレクトリ、同じ名前（拡張子のみ変更）をデフォルトとする
    input_path = Path(input_file_path)
    default_output = input_path.parent / f"{input_path.stem}.html"
    
    # 最後に使用した出力ディレクトリがある場合はそれを使用
    initial_dir = config.get("last_output_dir", str(default_output.parent))
    
    # ファイル保存ダイアログ
    output_path = filedialog.asksaveasfilename(
        title="HTMLファイルの保存先を選択してください",
        defaultextension=".html",
        filetypes=[
            ("HTMLファイル", "*.html"),
            ("HTMLファイル (*.htm)", "*.htm"),
            ("すべてのファイル", "*.*")
        ],
        initialfile=default_output.name,
        initialdir=initial_dir
    )
    
    root.destroy()
    
    # 選択されたファイルのディレクトリを保存
    if output_path:
        config["last_output_dir"] = os.path.dirname(output_path)
        save_config(config)
        
        # 拡張子の確認
        if not output_path.lower().endswith(('.html', '.htm')):
            # 拡張子がない場合は .html を追加
            output_path += '.html'
    
    return output_path

def show_progress_dialog():
    """変換進行状況を表示するダイアログ"""
    root = tk.Tk()
    root.title("変換中...")
    root.geometry("300x100")
    root.resizable(False, False)
    
    tk.Label(root, text="Excelファイルを変換しています...", font=("Arial", 10)).pack(pady=20)
    
    # ウィンドウを中央に配置
    root.update_idletasks()
    width = root.winfo_width()
    height = root.winfo_height()
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f"{width}x{height}+{x}+{y}")
    
    root.update()
    return root

def main():
    """メイン処理"""
    print("=== Excel to HTML 変換ツール ===")
    print("Excelファイルを選択してHTMLファイルに変換します。\n")
    
    # コマンドライン引数でファイルが指定されている場合
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
        if not os.path.exists(excel_file):
            print(f"エラー: 指定されたファイルが存在しません: {excel_file}")
            return
        
        print(f"入力ファイル: {excel_file}")
        
        # 保存先をダイアログで選択
        output_file = select_output_location(excel_file)
        
        if not output_file:
            print("出力先が選択されませんでした。プログラムを終了します。")
            return
        
        print(f"出力ファイル: {output_file}")
        print("変換を開始します...")
        
        try:
            excel_to_html(excel_file, output_file)
            print(f"\n変換完了! HTMLファイル: {output_file}")
            
            # 変換完了後、HTMLファイルを開くかの確認
            root = tk.Tk()
            root.withdraw()
            result = messagebox.askyesno(
                "変換完了", 
                f"変換が完了しました！\n\n出力ファイル: {output_file}\n\nHTMLファイルを開きますか？"
            )
            root.destroy()
            
            if result:
                os.startfile(output_file)
                
        except Exception as e:
            print(f"エラー: {e}")
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror("エラー", f"変換中にエラーが発生しました:\n{str(e)}")
            root.destroy()
        return
    
    # ダイアログモード
    try:
        # 1. Excelファイルを選択
        excel_file = select_excel_file()
        
        if not excel_file:
            print("ファイルが選択されませんでした。プログラムを終了します。")
            return
        
        if not os.path.exists(excel_file):
            messagebox.showerror("エラー", "選択されたファイルが存在しません。")
            return
        
        print(f"選択されたファイル: {excel_file}")
        
        # 2. 出力先を選択
        output_file = select_output_location(excel_file)
        
        if not output_file:
            print("出力先が選択されませんでした。プログラムを終了します。")
            return
        
        print(f"出力先: {output_file}")
        
        # 3. 変換実行
        progress_dialog = show_progress_dialog()
        
        try:
            # HTMLに変換（常に全シートを変換）
            excel_to_html(excel_file, output_file)
            
            progress_dialog.destroy()
            
            # 4. 完了メッセージ
            result = messagebox.askyesno(
                "変換完了", 
                f"変換が完了しました！\n\n出力ファイル: {output_file}\n\nHTMLファイルを開きますか？"
            )
            
            if result:
                # HTMLファイルをデフォルトブラウザで開く
                os.startfile(output_file)
            
            print("\n=== 変換完了 ===")
            print(f"入力ファイル: {excel_file}")
            print(f"出力ファイル: {output_file}")
            
        except Exception as e:
            progress_dialog.destroy()
            error_msg = f"変換中にエラーが発生しました:\n{str(e)}"
            messagebox.showerror("エラー", error_msg)
            print(f"エラー: {e}")
    
    except Exception as e:
        error_msg = f"予期しないエラーが発生しました:\n{str(e)}"
        messagebox.showerror("エラー", error_msg)
        print(f"予期しないエラー: {e}")

if __name__ == "__main__":
    main()

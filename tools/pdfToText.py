import pdfplumber
from operator import itemgetter
import os
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog

def extract_contents(page):
    """PDFページから重複しないテキストおよび表データを抽出する。"""
    contents = []
    tables = page.find_tables()
    # tables = page.find_tables(table_settings={"horizontal_strategy": "text"})
    
    # テーブルに含まれないすべてのテキストデータを抽出
    non_table_content = page
    for table in tables:
        non_table_content = non_table_content.outside_bbox(table.bbox)
        
    for line in non_table_content.extract_text_lines():
        contents.append({'top': line['top'], 'text': line['text']})

    # すべての表データを抽出
    for table in tables:
        contents.append({'top': table.bbox[1], 'table': table})

    # 行を上部位置でソート
    contents = sorted(contents, key=itemgetter('top'))

    return contents

def sanitize_cell(cell):
    """セルの内容を整理する。"""
    if cell is None:
        return ""
    else:
        # すべての種類の空白を削除し、文字列であることを保証
        return ' '.join(str(cell).split())

def process_pdf(pdf_path, output_dir, file_prefix):
    """PDFの各ページを処理して1つのMarkdownファイルに保存する。"""
    
    all_pages_contents = []
    
    with pdfplumber.open(pdf_path) as pdf:
        print(f"Processing {len(pdf.pages)} pages...")
        
        # 全ページのデータを収集
        for i, page in enumerate(pdf.pages):
            print(f"Processing page {i+1}...")
            lines = extract_contents(page)
            all_pages_contents.append((i+1, lines))
    
    # 全ページのデータを1つのファイルに保存
    save_all_pages_to_markdown(output_dir, file_prefix, all_pages_contents)
    
    print(f"Successfully processed {len(all_pages_contents)} pages into a single markdown file.")

def save_all_pages_to_markdown(directory, file_prefix, all_pages_contents):
    """全ページの内容を1つのMarkdownファイルに保存する。"""
    filename = f"{file_prefix}.md"
    filepath = os.path.join(directory, filename)
    if not os.path.exists(directory):
        os.makedirs(directory)

    with open(filepath, 'w', encoding='utf-8') as file:
        # ファイルタイトルを書き込む
        file.write(f'# {file_prefix}\n\n')
          # 各ページの内容を順番に書き込む
        for page_number, contents in all_pages_contents:
            # ページヘッダーを書き込む（最初のページ以外は改行を追加）
            # if page_number > 1:
            #     file.write('\n\n')
            # file.write(f'## Page {page_number}\n\n')

            # ページ内容を書き込む
            for content in contents:
                if 'text' in content:

                    # ページ番号と思われるテキストをスキップ
                    if content['text'].strip().isdigit() and content['text'].strip() == str(page_number - 1):
                        continue

                    # テキスト内容を段落として書き込む
                    file.write(f"{content['text']}\n\n")
                elif 'table' in content:
                    table = content['table']
                    unsanitized_table = table.extract()  # 表オブジェクトからデータを抽出
                    
                    # 空の表をスキップ
                    if not unsanitized_table or not unsanitized_table[0]:
                        continue
                        
                    sanitized_table = [[sanitize_cell(cell) for cell in row] for row in unsanitized_table]
                    # ヘッダーセパレーターを作成
                    header_separator = '|:--' * len(sanitized_table[0]) + ':|\n'
                    # テーブルデータをMarkdown形式に変換
                    for i, row in enumerate(sanitized_table):
                        md_row = '| ' + ' | '.join(row) + ' |\n'
                        file.write(md_row)
                        # 最初の行（ヘッダー行）の後にヘッダーセパレーターを追加
                        if i == 0:
                            file.write(header_separator)
                    # テーブルの後にセパレーターを追加
                    file.write('\n\n')

        print(f"All pages have been written to {filename}")

# ページ毎に出力したい場合の処理    
# def save_to_markdown(directory, file_prefix, page_number, contents):
#     """抽出した内容をMarkdownファイルに保存する。"""
#     filename = f"{file_prefix}_page_{page_number}.md"
#     filepath = os.path.join(directory, filename)
#     if not os.path.exists(directory):
#         os.makedirs(directory)

#     with open(filepath, 'w', encoding='utf-8') as file:
#         file.write(f'# Page {page_number}\n\n')

#         for content in contents:
#             if 'text' in content:
#                 # テキスト内容を段落として書き込む
#                 file.write(f"{content['text']}\n\n")
#             elif 'table' in content:
#                 table = content['table']
#                 unsanitized_table = table.extract()  # 表オブジェクトからデータを抽出
#                 sanitized_table = [[sanitize_cell(cell) for cell in row] for row in unsanitized_table]
#                 # ヘッダーセパレーターを作成
#                 header_separator = '|:--' * len(sanitized_table[0]) + ':|\n'
#                 # テーブルデータをMarkdown形式に変換
#                 for i, row in enumerate(sanitized_table):
#                     md_row = '| ' + ' | '.join(row) + ' |\n'
#                     file.write(md_row)
#                     # 最初の行（ヘッダー行）の後にヘッダーセパレーターを追加
#                     if i == 0:
#                         file.write(header_separator)
#                 # テーブルの後にセパレーターを追加（任意）
#                 file.write('\n---\n\n')

#         print(f"{page_number} has been written to {filename}")

def select_files_and_process():
    """ファイル選択ダイアログを表示してPDF変換を実行する。"""
    # tkinterのルートウィンドウを作成（非表示）
    root = tk.Tk()
    root.withdraw()  # ルートウィンドウを非表示にする
    
    try:
        # 1. 変換元PDFファイルの選択
        pdf_path = filedialog.askopenfilename(
            title="変換するPDFファイルを選択してください",
            filetypes=[
                ("PDFファイル", "*.pdf"),
                ("すべてのファイル", "*.*")
            ],
            initialdir=os.getcwd()
        )
        
        if not pdf_path:
            messagebox.showinfo("キャンセル", "ファイル選択がキャンセルされました。")
            return
        
        # 2. 出力ディレクトリの選択
        output_dir = filedialog.askdirectory(
            title="変換後のファイルの保存先フォルダを選択してください",
            initialdir=os.getcwd()
        )
        
        if not output_dir:
            messagebox.showinfo("キャンセル", "保存先の選択がキャンセルされました。")
            return
          # 3. ファイルプレフィックスの入力
        # PDFファイル名から拡張子を除いた部分をデフォルト値として使用
        default_prefix = os.path.splitext(os.path.basename(pdf_path))[0]
        
        file_prefix = simpledialog.askstring(
            "ファイル名",
            "変換後のファイル名を入力してください\n"
            f"（例: {default_prefix}.md として出力されます）",
            initialvalue=default_prefix
        )
        
        if not file_prefix:
            messagebox.showinfo("キャンセル", "ファイル名の入力がキャンセルされました。")
            return
          # 4. 変換処理の実行
        messagebox.showinfo("処理開始", f"PDF変換を開始します。\n\n入力ファイル: {os.path.basename(pdf_path)}\n出力先: {output_dir}\nファイル名: {file_prefix}.md")
          # 実際の変換処理を実行
        process_pdf(pdf_path, output_dir, file_prefix)
        
        # 完了メッセージ
        messagebox.showinfo("完了", f"PDF変換が完了しました！\n\n出力先: {output_dir}")
        
    except Exception as e:
        messagebox.showerror("エラー", f"処理中にエラーが発生しました:\n{str(e)}")
    
    finally:
        root.destroy()

# メイン処理
if __name__ == "__main__":
    # GUIダイアログを使用してファイル選択と変換を実行
    select_files_and_process()

"""
HTML生成関連のユーティリティ関数
"""
import html
import os


def generate_html_header(excel_file: str) -> str:
    """HTMLファイルのヘッダー部分を生成"""
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Excel to HTML - {os.path.basename(excel_file)}</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }}
        .sheet-container {{
            background-color: white;
            margin-bottom: 30px;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        .sheet-title {{
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #333;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 10px;
        }}
        table {{
            border-collapse: collapse;
            margin-bottom: 20px;
            table-layout: fixed; /* 固定レイアウトでセル幅を正確に制御 */
        }}
        td, th {{
            border: 1px solid #ddd;
            padding: 2px 4px; /* 上下パディングを少なくしてExcelに近づける */
            min-width: 20px;
            min-height: 20px;
            overflow: hidden; /* セル内容がはみ出さないようにする */
            word-wrap: break-word; /* 長いテキストを折り返し */
            box-sizing: border-box; /* パディングを含めたサイズ計算 */
            white-space: nowrap; /* 基本的に改行しない（Excelライク） */
            vertical-align: top; /* セルの縦位置を上揃えに */
        }}
        td.multiline {{
            white-space: pre-wrap; /* 改行が含まれる場合のみ折り返す */
        }}
        .empty-cell {{
            background-color: #FFFFFF;
        }}
    </style>
</head>
<body>
    <h1>Excel File: {html.escape(os.path.basename(excel_file))}</h1>
"""


def generate_html_footer() -> str:
    """HTMLファイルのフッター部分を生成"""
    return """</body>
</html>"""


def generate_sheet_header(sheet_name: str) -> str:
    """シートのヘッダー部分を生成"""
    return f"""
    <div class="sheet-container">
        <div class="sheet-title">{html.escape(sheet_name)}</div>
        <table>
"""


def generate_sheet_footer() -> str:
    """シートのフッター部分を生成"""
    return """        </table>
    </div>
"""


def generate_colgroup(column_widths: list) -> str:
    """テーブルのcolgroupを生成"""
    colgroup = "            <colgroup>\n"
    for width_px in column_widths:
        colgroup += f"                <col style=\"width: {width_px}px;\">\n"
    colgroup += "            </colgroup>\n"
    return colgroup


def generate_table_with_width(total_width: int) -> str:
    """幅指定付きのテーブル開始タグを生成"""
    return f'<table style="width: {total_width}px; table-layout: fixed;">'

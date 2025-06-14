"""
HTML生成関連のユーティリティ関数
"""
import html
import os
from typing import List, Dict


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
            position: relative; /* 図形の絶対配置のため */
        }}
        .sheet-title {{
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #333;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 10px;
        }}        table {{
            border-collapse: collapse;
            margin-bottom: 20px;
            table-layout: fixed !important; /* 強制的に固定レイアウトを適用 */
            box-sizing: border-box;
            position: relative; /* 図形のz-indexのため */
            z-index: 1;
        }}        td, th {{
            border: 1px solid #ddd;
            padding: 0px 2px; /* Excelに近いパディング */
            overflow: visible; /* セル内容のはみ出しを許可 */
            word-wrap: break-word; /* 長いテキストを折り返し */
            box-sizing: border-box; /* パディングを含めたサイズ計算 */
            white-space: nowrap; /* 基本的に改行しない（Excelライク） */
            vertical-align: top; /* セルの縦位置を上揃えに */
            text-overflow: clip; /* 省略記号は使わず、クリップする */
            font-size: 11px; /* Excelのデフォルトに近いサイズ */
            font-family: 'Calibri', Arial, sans-serif; /* Excelのデフォルトフォント */
            position: relative; /* 隣のセルにはみ出すため */
            z-index: 1; /* 基本のレイヤー */
        }}
        /* 文字が入力されているセルは上位レイヤーに */
        td:not(.empty-cell) {{
            z-index: 2;
        }}
        /* セルの幅はcolgroupでのみ制御 */
        td {{
            width: auto !important;
            min-width: unset !important;
            max-width: unset !important;
        }}        td.multiline {{
            white-space: pre-wrap; /* 改行が含まれる場合のみ折り返す */
        }}
        .empty-cell {{
            background-color: #FFFFFF;
            z-index: 0; /* 空のセルは最下位レイヤー */
        }}
        /* 長いテキストがはみ出す際のスタイル調整 */
        td {{
            background-clip: padding-box; /* 背景を枠線内に制限 */
        }}        /* テーブル行にマウスオーバーした時の効果（デバッグ用、必要に応じて削除） */
        tr:hover {{
            background-color: rgba(0, 123, 255, 0.05);
        }}
        
        /* 図形のスタイル */
        .excel-shape {{
            position: absolute;
            z-index: 10; /* テーブルより上に表示 */
            pointer-events: auto;
            box-sizing: border-box;
        }}
        
        .excel-image {{
            border-radius: 2px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }}
        
        .excel-chart {{
            background-color: #f9f9f9;
            border: 1px solid #ccc;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #666;
            text-align: center;
        }}        .excel-shape-rect {{
            border-radius: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-family: 'Calibri', Arial, sans-serif;
            word-wrap: break-word;
            white-space: nowrap;
            min-height: 25px;
            min-width: 60px;
        }}
          .excel-textbox {{
            border-radius: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-family: 'Calibri', Arial, sans-serif;
            font-weight: bold;
            word-wrap: break-word;
            white-space: nowrap;
            min-height: 30px;
            min-width: 80px;
        }}
        
        .excel-placeholder-image {{
            border-radius: 2px;
            background-color: #E0E0E0;
            border: 1px dashed #808080;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #666;
        }}
    </style>
    <script>
        // Excelライクなセルのはみ出し制御
        document.addEventListener('DOMContentLoaded', function() {{
            const tables = document.querySelectorAll('table');
            
            tables.forEach(table => {{
                const rows = table.querySelectorAll('tr');
                
                rows.forEach(row => {{
                    const cells = row.querySelectorAll('td');
                    
                    cells.forEach((cell, index) => {{
                        // セルのテキストが幅を超える場合の処理
                        if (cell.scrollWidth > cell.offsetWidth) {{
                            // 右隣のセルが空かどうかチェック
                            const nextCell = cells[index + 1];
                            if (nextCell && nextCell.classList.contains('empty-cell')) {{
                                // 隣のセルが空の場合、はみ出し表示を許可
                                cell.style.overflow = 'visible';
                                cell.style.whiteSpace = 'nowrap';
                                cell.style.zIndex = '10';
                                
                                // 次のセルの背景を透明にしてはみ出しを見えるようにする
                                nextCell.style.backgroundColor = 'transparent';
                                nextCell.style.zIndex = '1';
                            }} else {{
                                // 隣のセルが空でない場合は通常の表示
                                cell.style.overflow = 'hidden';
                                cell.style.textOverflow = 'clip';
                            }}
                        }}
                    }});
                }});
            }});
        }});
    </script>
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
    for i, width_px in enumerate(column_widths):
        # Excelの実際の幅をそのまま適用（最小・最大幅制限なし）
        colgroup += f"                <col style=\"width: {width_px}px;\">\n"
    colgroup += "            </colgroup>\n"
    return colgroup


def generate_table_with_width(total_width: int) -> str:
    """幅指定付きのテーブル開始タグを生成"""
    return f'<table style="width: {total_width}px; table-layout: fixed; border-collapse: collapse;">'


def generate_shapes_html(shapes: List[Dict], column_widths: List[float], row_heights: List[float]) -> str:
    """図形をHTMLに変換"""
    if not shapes:
        return ""
    
    print(f"図形HTML生成開始: {len(shapes)}個の図形")
    html_content = ""
    
    for i, shape in enumerate(shapes):
        try:
            print(f"図形{i+1}処理中: タイプ={shape.get('type', 'unknown')}")
            
            if shape['type'] == 'image':
                shape_html = generate_image_html(shape, column_widths, row_heights)
                html_content += shape_html
                print(f"画像{i+1}のHTML生成完了")
            elif shape['type'] == 'chart':
                shape_html = generate_chart_html(shape, column_widths, row_heights)
                html_content += shape_html
                print(f"チャート{i+1}のHTML生成完了")
            elif shape['type'] == 'shape':
                shape_html = generate_shape_html(shape, column_widths, row_heights)
                html_content += shape_html
                print(f"図形{i+1}のHTML生成完了")
            elif shape['type'] == 'textbox':
                shape_html = generate_textbox_html(shape, column_widths, row_heights)
                html_content += shape_html
                print(f"テキストボックス{i+1}のHTML生成完了")
            elif shape['type'] == 'placeholder_image':
                shape_html = generate_placeholder_image_html(shape, column_widths, row_heights)
                html_content += shape_html
                print(f"プレースホルダー画像{i+1}のHTML生成完了")
            else:
                print(f"未知の図形タイプ: {shape['type']}")
        except Exception as e:
            print(f"図形{i+1}のHTML生成でエラー: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"図形HTML生成完了。生成されたHTML長: {len(html_content)}文字")
    return html_content


def generate_image_html(image_info: Dict, column_widths: List[float], row_heights: List[float]) -> str:
    """画像のHTMLを生成"""
    from .shape_utils import calculate_shape_position
    
    # 位置を計算
    left, top = calculate_shape_position(
        image_info['col'], image_info['row'],
        image_info['col_offset'], image_info['row_offset'],
        column_widths, row_heights
    )
    
    # データURL形式で画像を埋め込み
    data_url = f"data:image/{image_info['format']};base64,{image_info['data']}"
    
    return f"""
        <img class="excel-shape excel-image" 
             src="{data_url}"
             alt="{html.escape(image_info.get('name', 'image'))}"
             style="left: {left}px; top: {top}px; width: {image_info['width']}px; height: {image_info['height']}px;">
    """


def generate_chart_html(chart_info: Dict, column_widths: List[float], row_heights: List[float]) -> str:
    """チャートのHTMLを生成"""
    from .shape_utils import calculate_shape_position, calculate_shape_size
    
    # 位置とサイズを計算
    left, top = calculate_shape_position(
        chart_info['col'], chart_info['row'],
        chart_info['col_offset'], chart_info['row_offset'],
        column_widths, row_heights
    )
    
    width, height = calculate_shape_size(
        chart_info['col'], chart_info['row'],
        chart_info['to_col'], chart_info['to_row'],
        chart_info['col_offset'], chart_info['row_offset'],
        chart_info.get('to_col_offset', 0), chart_info.get('to_row_offset', 0),
        column_widths, row_heights
    )
    
    chart_name = chart_info.get('name', 'Chart')
    chart_type = chart_info.get('chart_type', 'Chart')
    
    return f"""
        <div class="excel-shape excel-chart"
             style="left: {left}px; top: {top}px; width: {width}px; height: {height}px;">
            <div>{html.escape(chart_name)}<br><small>({html.escape(chart_type)})</small></div>
        </div>
    """


def generate_shape_html(shape_info: Dict, column_widths: List[float], row_heights: List[float]) -> str:
    """図形のHTMLを生成"""
    from .shape_utils import calculate_shape_position, calculate_shape_size
    
    # 位置とサイズを計算
    left, top = calculate_shape_position(
        shape_info['col'], shape_info['row'],
        shape_info['col_offset'], shape_info['row_offset'],
        column_widths, row_heights
    )
    
    width, height = calculate_shape_size(
        shape_info['col'], shape_info['row'],
        shape_info['to_col'], shape_info['to_row'],
        shape_info['col_offset'], shape_info['row_offset'],
        shape_info.get('to_col_offset', 0), shape_info.get('to_row_offset', 0),
        column_widths, row_heights
    )
    
    # 最小サイズを保証
    width = max(width, 60)  # 最小幅60px
    height = max(height, 25)  # 最小高25px
    
    # スタイル情報を取得
    style = shape_info.get('style', {})
    font_size = style.get('font_size', 11)
    
    # line-heightを適切に設定
    line_height = max(font_size * 1.2, height - 8)  # padding分を考慮
    
    # CSSスタイルを構築
    css_style = f"""
        left: {left}px; 
        top: {top}px; 
        width: {width}px; 
        height: {height}px;
        background-color: {style.get('fill_color', '#FFFFFF')};
        border: {style.get('border_width', 1)}px solid {style.get('border_color', '#000000')};
        color: {style.get('font_color', '#000000')};
        font-size: {font_size}px;
        line-height: {line_height}px;
        padding: 4px;
        box-sizing: border-box;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
    """.strip()
    
    text_content = html.escape(shape_info.get('text', ''))
    
    return f"""
        <div class="excel-shape excel-shape-rect"
             style="{css_style}">
            {text_content}
        </div>
    """


def generate_textbox_html(textbox_info: Dict, column_widths: List[float], row_heights: List[float]) -> str:
    """テキストボックスのHTMLを生成"""
    from .shape_utils import calculate_shape_position, calculate_shape_size
    
    # 位置とサイズを計算
    left, top = calculate_shape_position(
        textbox_info['col'], textbox_info['row'],
        textbox_info['col_offset'], textbox_info['row_offset'],
        column_widths, row_heights
    )
    
    width, height = calculate_shape_size(
        textbox_info['col'], textbox_info['row'],
        textbox_info['to_col'], textbox_info['to_row'],
        textbox_info['col_offset'], textbox_info['row_offset'],
        textbox_info.get('to_col_offset', 0), textbox_info.get('to_row_offset', 0),
        column_widths, row_heights
    )
    
    # 最小サイズを保証
    width = max(width, 80)  # 最小幅80px
    height = max(height, 30)  # 最小高30px
    
    # スタイル情報を取得
    style = textbox_info.get('style', {})
    font_size = style.get('font_size', 11)
    
    # line-heightを適切に設定（フォントサイズの1.2倍、または高さに基づく）
    line_height = max(font_size * 1.2, height - 8)  # padding分を考慮
    
    # CSSスタイルを構築
    css_style = f"""
        left: {left}px; 
        top: {top}px; 
        width: {width}px; 
        height: {height}px;
        background-color: {style.get('fill_color', '#F0F0F0')};
        border: {style.get('border_width', 1)}px solid {style.get('border_color', '#808080')};
        color: {style.get('font_color', '#000000')};
        font-size: {font_size}px;
        line-height: {line_height}px;
        padding: 4px;
        box-sizing: border-box;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
    """.strip()
    
    text_content = html.escape(textbox_info.get('text', ''))
    
    return f"""
        <div class="excel-shape excel-textbox"
             style="{css_style}">
            {text_content}
        </div>
    """


def generate_placeholder_image_html(placeholder_info: Dict, column_widths: List[float], row_heights: List[float]) -> str:
    """プレースホルダー画像のHTMLを生成"""
    from .shape_utils import calculate_shape_position
    
    # 位置を計算
    left, top = calculate_shape_position(
        placeholder_info['col'], placeholder_info['row'],
        placeholder_info['col_offset'], placeholder_info['row_offset'],
        column_widths, row_heights
    )
    
    return f"""
        <div class="excel-shape excel-placeholder-image"
             style="left: {left}px; top: {top}px; width: {placeholder_info['width']}px; height: {placeholder_info['height']}px; 
                    background-color: #E0E0E0; border: 1px dashed #808080; display: flex; align-items: center; justify-content: center; 
                    font-size: 10px; color: #666;">
            {html.escape(placeholder_info.get('name', 'Image'))}
        </div>
    """

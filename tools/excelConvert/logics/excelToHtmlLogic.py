from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Border, Alignment
import html
import os
from typing import Optional
import tempfile
import shutil



def rgb_to_hex(rgb_value) -> str:
    """RGB値を16進数に変換（より堅牢なバージョン）"""
    if rgb_value is None:
        return ""
    
    try:
        # openpyxlのColor オブジェクトの場合
        if hasattr(rgb_value, 'rgb') and rgb_value.rgb:
            rgb_str = str(rgb_value.rgb)
            # ARGB形式（8文字）の場合、最初の2文字（アルファ値）を除去
            if len(rgb_str) == 8:
                rgb_str = rgb_str[2:]
            # RGB形式（6文字）の場合はそのまま
            elif len(rgb_str) == 6:
                pass
            else:
                return ""
            return f"#{rgb_str.upper()}"
        
        # valueプロパティがある場合
        elif hasattr(rgb_value, 'value') and rgb_value.value:
            rgb_str = str(rgb_value.value)
            if len(rgb_str) == 8:
                rgb_str = rgb_str[2:]
            elif len(rgb_str) == 6:
                pass
            else:
                return ""
            return f"#{rgb_str.upper()}"
        
        # 直接文字列の場合
        elif isinstance(rgb_value, str):
            rgb_str = rgb_value.replace('#', '')
            if len(rgb_str) == 8:
                rgb_str = rgb_str[2:]
            elif len(rgb_str) == 6:
                pass
            else:
                return ""
            return f"#{rgb_str.upper()}"
        
        # indexed カラーの場合（デフォルト色）
        elif hasattr(rgb_value, 'index') and rgb_value.index is not None:
            # インデックス色の場合は色を返さない（デフォルト色とみなす）
            return ""
            
    except Exception as e:
        print(f"色変換エラー: {e}, 値: {rgb_value}")
        return ""
    
    return ""

def get_cell_style(cell, worksheet=None, row_idx=None, col_idx=None) -> str:
    """セルのスタイル情報をCSS形式で取得"""
    styles = []
      # セルの幅と高さを取得して適用
    if worksheet and row_idx and col_idx:
        # 列幅を取得（Excelの単位からピクセルに変換）
        column_letter = cell.column_letter
        if column_letter in worksheet.column_dimensions:
            col_width = worksheet.column_dimensions[column_letter].width
            if col_width:
                # Excelの列幅をピクセルに変換
                width_px = excel_to_pixels(col_width, True)
                styles.append(f"width: {width_px}px")
        
        # 行高を取得
        if row_idx in worksheet.row_dimensions:
            row_height = worksheet.row_dimensions[row_idx].height
            if row_height:
                # Excelのポイントをピクセルに変換
                height_px = excel_to_pixels(row_height, False)
                styles.append(f"height: {height_px}px")
      # フォント設定（改善版）
    if cell.font:
        font = cell.font
        
        # フォントの太字
        if font.bold is True:
            styles.append("font-weight: bold")
        elif font.bold is False:
            styles.append("font-weight: normal")
        
        # フォントの斜体
        if font.italic is True:
            styles.append("font-style: italic")
        elif font.italic is False:
            styles.append("font-style: normal")
        
        # フォントサイズ
        if font.size and font.size > 0:
            styles.append(f"font-size: {font.size}pt")  # Excelはポイント単位
        else:
            styles.append("font-size: 11pt")  # Excelのデフォルト
        
        # フォント名
        if font.name:
            styles.append(f"font-family: '{font.name}', Arial, sans-serif")
        else:
            styles.append("font-family: 'Calibri', Arial, sans-serif")  # Excelのデフォルト
        
        # フォント色
        font_color = rgb_to_hex(font.color)
        if font_color:
            styles.append(f"color: {font_color}")
        else:
            styles.append("color: #000000")  # デフォルトは黒
            
        # 下線
        if font.underline and font.underline != 'none':
            styles.append("text-decoration: underline")
        
        # 取り消し線
        if font.strike is True:
            styles.append("text-decoration: line-through")
    else:
        # フォント情報がない場合のデフォルト設定
        styles.append("font-size: 11pt")
        styles.append("font-family: 'Calibri', Arial, sans-serif")
        styles.append("color: #000000")# 背景色（改善版）
    has_background = False
    if cell.fill:
        # PatternFillの場合
        if hasattr(cell.fill, 'start_color') and cell.fill.start_color:
            bg_color = rgb_to_hex(cell.fill.start_color)
            if bg_color and bg_color.upper() not in ["#00000000", "#000000"]:
                styles.append(f"background-color: {bg_color}")
                has_background = True
        # GradientFillの場合
        elif hasattr(cell.fill, 'start') and cell.fill.start:
            bg_color = rgb_to_hex(cell.fill.start)
            if bg_color and bg_color.upper() not in ["#00000000", "#000000"]:
                styles.append(f"background-color: {bg_color}")
                has_background = True
        # fillTypeがsolidの場合
        elif hasattr(cell.fill, 'fgColor') and cell.fill.fgColor:
            bg_color = rgb_to_hex(cell.fill.fgColor)
            if bg_color and bg_color.upper() not in ["#00000000", "#000000"]:
                styles.append(f"background-color: {bg_color}")
                has_background = True
    
    # 背景色が設定されていない場合は白色を設定
    if not has_background:
        styles.append("background-color: #FFFFFF")
    
    # 文字揃え
    if cell.alignment:
        alignment = cell.alignment
        if alignment.horizontal:
            if alignment.horizontal == 'center':
                styles.append("text-align: center")
            elif alignment.horizontal == 'right':
                styles.append("text-align: right")
            elif alignment.horizontal == 'left':
                styles.append("text-align: left")
        
        if alignment.vertical:
            if alignment.vertical == 'center':
                styles.append("vertical-align: middle")
            elif alignment.vertical == 'top':
                styles.append("vertical-align: top")
            elif alignment.vertical == 'bottom':
                styles.append("vertical-align: bottom")
      # 境界線（改善版）
    if cell.border:
        border = cell.border
        border_styles = []
        
        def get_border_style(border_side):
            """境界線のスタイルを取得"""
            if not border_side or not border_side.style:
                return None
            
            # 線の太さとスタイルを判定
            style = border_side.style
            color = rgb_to_hex(border_side.color) if border_side.color else "#000000"
            
            if style in ['thin', 'hair']:
                return f"1px solid {color}"
            elif style in ['medium']:
                return f"2px solid {color}"
            elif style in ['thick']:
                return f"3px solid {color}"
            elif style in ['dashed']:
                return f"1px dashed {color}"
            elif style in ['dotted']:
                return f"1px dotted {color}"
            elif style in ['double']:
                return f"3px double {color}"
            else:
                return f"1px solid {color}"
        
        # 各辺の境界線を処理
        if border.top:
            top_style = get_border_style(border.top)
            if top_style:
                border_styles.append(f"border-top: {top_style}")
        
        if border.bottom:
            bottom_style = get_border_style(border.bottom)
            if bottom_style:
                border_styles.append(f"border-bottom: {bottom_style}")
        
        if border.left:
            left_style = get_border_style(border.left)
            if left_style:
                border_styles.append(f"border-left: {left_style}")
        
        if border.right:
            right_style = get_border_style(border.right)
            if right_style:
                border_styles.append(f"border-right: {right_style}")
        
        styles.extend(border_styles)
    
    return "; ".join(styles)

def get_cell_dimensions(worksheet) -> tuple:
    """ワークシートの使用範囲を取得"""
    if worksheet.max_row == 1 and worksheet.max_column == 1:
        # 空のシートの場合
        return 0, 0
    return worksheet.max_row, worksheet.max_column

def excel_to_html(excel_file: str, output_file: str, sheet_names: Optional[list] = None):
    """
    Excelファイルを外観を保ったHTMLファイルに変換
    
    Args:
        excel_file (str): 入力Excelファイルパス
        output_file (str): 出力HTMLファイルパス
        sheet_names (list, optional): 変換するシート名のリスト。Noneの場合は全シート
    """
    if not os.path.exists(excel_file):
        raise FileNotFoundError(f"ファイルが見つかりません: {excel_file}")    # Excel関数の計算結果を取得（xlwingsを使用）
    print("Excel関数の計算結果を取得中...")
    calculated_values = None
    
    # xlwingsでの取得を試行（Windows環境でExcelがインストールされている場合）
    print("xlwingsで計算結果を取得中...")
    try:
        calculated_values = get_excel_calculated_values_xlwings(excel_file)
    except Exception as e:
        print(f"xlwingsでの取得に失敗: {e}")
    
    # 取得に失敗した場合は空の辞書を使用
    if calculated_values is None:
        print("関数の計算結果取得に失敗。フォーミュラを表示します。")
        calculated_values = {}

    # Excelファイルを読み込み（スタイル情報取得のため）
    workbook = load_workbook(excel_file, data_only=False)
    
    # 変換対象のシートを決定
    if sheet_names is None:
        target_sheets = workbook.sheetnames
    else:
        target_sheets = [name for name in sheet_names if name in workbook.sheetnames]
    
    if not target_sheets:
        raise ValueError("変換対象のシートが見つかりません")
    
    # HTMLの開始
    html_content = f"""<!DOCTYPE html>
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
        }}        table {{
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
    
    # 各シートを処理
    for sheet_name in target_sheets:
        worksheet = workbook[sheet_name]
        max_row, max_col = get_cell_dimensions(worksheet)
        
        if max_row == 0 or max_col == 0:
            # 空のシートの場合はスキップ
            continue
        
        html_content += f"""
    <div class="sheet-container">
        <div class="sheet-title">{html.escape(sheet_name)}</div>
        <table>
"""        # 列幅を設定するためのcolgroup要素を追加
        default_col_width_px, default_row_height_px = get_default_dimensions(worksheet)
        
        # セル内容に基づく最適な寸法を計算
        optimal_column_widths = calculate_optimal_column_widths(worksheet, max_row, max_col)
        optimal_row_heights = calculate_optimal_row_heights(worksheet, max_row, max_col)
        
        # テーブル全体の幅を計算
        total_table_width = 0
        column_widths_for_table = []
        
        for col_idx in range(1, max_col + 1):
            column_letter = worksheet.cell(row=1, column=col_idx).column_letter
            
            # 明示的に設定された列幅があるかチェック
            if column_letter in worksheet.column_dimensions and worksheet.column_dimensions[column_letter].width:
                col_width = worksheet.column_dimensions[column_letter].width
                width_px = excel_to_pixels(col_width, True)
            else:
                # セル内容に基づく最適な幅を使用
                width_px = optimal_column_widths.get(col_idx, default_col_width_px)
            
            column_widths_for_table.append(width_px)
            total_table_width += width_px
        
        # テーブルスタイルを更新（固定幅に設定）
        html_content = html_content.replace('<table>', f'<table style="width: {total_table_width}px; table-layout: fixed;">')
        
        html_content += "            <colgroup>\n"
        for width_px in column_widths_for_table:
            html_content += f"                <col style=\"width: {width_px}px;\">\n"
        html_content += "            </colgroup>\n"# セルデータを処理
        for row_idx in range(1, max_row + 1):
            # 行の高さを取得してスタイルに追加
            row_style = ""
            
            # 明示的に設定された行高があるかチェック
            if row_idx in worksheet.row_dimensions and worksheet.row_dimensions[row_idx].height:
                row_height = worksheet.row_dimensions[row_idx].height
                height_px = excel_to_pixels(row_height, False)
                row_style = f' style="height: {height_px}px;"'
            else:
                # セル内容に基づく最適な高さを使用
                optimal_height = optimal_row_heights.get(row_idx, default_row_height_px)
                row_style = f' style="height: {optimal_height}px;"'
            
            html_content += f"            <tr{row_style}>\n"
            
            for col_idx in range(1, max_col + 1):
                cell = worksheet.cell(row=row_idx, column=col_idx)                # セルの値を取得
                cell_value = None
                
                # 関数が含まれている場合は計算結果を使用
                if cell.data_type == 'f':  # 関数セルの場合
                    print(f"関数セル検出: {sheet_name} 行{row_idx}, 列{col_idx}")
                    print(f"  関数式: {cell.value}")
                    
                    # 事前取得した計算結果辞書から値を取得
                    if sheet_name in calculated_values and (row_idx, col_idx) in calculated_values[sheet_name]:
                        cell_value = calculated_values[sheet_name][(row_idx, col_idx)]
                        print(f"  ✓ 計算結果: {cell_value}")
                    else:
                        # 計算結果が取得できない場合は関数式を表示
                        cell_value = f"[関数: {cell.value}]"
                        print(f"  ⚠ 計算結果が取得できません。関数式を表示: {cell_value}")
                else:
                    # 通常のセルの場合
                    cell_value = cell.value
                
                if cell_value is None:
                    cell_value = ""
                else:
                    cell_value = str(cell_value)                # セルのスタイルを取得（幅と高さ情報を含む）
                cell_style = get_cell_style(cell, worksheet, row_idx, col_idx)
                
                # デバッグ: スタイル情報を出力（最初の10セルのみ）
                if row_idx <= 3 and col_idx <= 3:
                    print(f"セル {row_idx},{col_idx}: フォント={cell.font}, 塗りつぶし={cell.fill}, スタイル={cell_style[:100]}...")
                
                # セルのスタイルが空の場合のデフォルト設定
                if not cell_style:
                    cell_style = "background-color: #FFFFFF; color: #000000; font-family: 'Calibri', Arial, sans-serif; font-size: 11pt"# 空のセルの場合はクラスを追加、改行が含まれる場合もクラスを追加
                css_classes = []
                if not cell_value:
                    css_classes.append("empty-cell")
                if '\n' in str(cell_value):
                    css_classes.append("multiline")
                
                css_class = f' class="{" ".join(css_classes)}"' if css_classes else ''
                
                # HTMLに追加（常にstyle属性を含める）
                html_content += f'                <td style="{cell_style}"{css_class}>{html.escape(cell_value)}</td>\n'
            
            html_content += "            </tr>\n"
        
        html_content += """        </table>
    </div>
"""
    
    # HTMLの終了
    html_content += """</body>
</html>"""    # HTMLファイルに保存
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"HTMLファイルが作成されました: {output_file}")
    print(f"変換されたシート数: {len(target_sheets)}")
    for sheet_name in target_sheets:
        print(f"  - {sheet_name}")

def get_excel_calculated_values_xlwings(excel_file: str):
    """xlwingsを使用してExcelファイルから関数の計算結果を取得"""
    try:
        import xlwings as xw
        
        print("xlwingsでExcelファイルを開いて計算実行中...")
        
        # 非表示でExcelアプリケーションを開始
        app = xw.App(visible=False, add_book=False)
        
        try:
            # ワークブックを開く
            wb = app.books.open(excel_file)
            
            # 計算方式を自動に設定
            app.calculation = 'automatic'
            
            # 計算を強制実行（複数回実行して確実に計算）
            wb.app.calculate()
            wb.app.calculate()  # 2回実行して確実に
            
            # 計算結果を辞書に保存
            calculated_values = {}
            
            for sheet in wb.sheets:
                sheet_name = sheet.name
                calculated_values[sheet_name] = {}
                
                # 使用範囲を取得
                used_range = sheet.used_range
                if used_range:
                    print(f"シート '{sheet_name}': 使用範囲 {used_range.address}")
                    
                    # 使用範囲内の全セルを処理
                    values = used_range.value
                    if values is not None:
                        # valuesが2次元リストでない場合（単一セル）の処理
                        if not isinstance(values, list):
                            calculated_values[sheet_name][(1, 1)] = values
                        elif len(values) > 0 and not isinstance(values[0], list):
                            # 1行の場合
                            for col_idx, value in enumerate(values):
                                if value is not None:
                                    calculated_values[sheet_name][(1, col_idx + 1)] = value
                        else:
                            # 2次元の場合
                            for row_idx, row_values in enumerate(values):
                                if isinstance(row_values, list):
                                    for col_idx, value in enumerate(row_values):
                                        if value is not None:
                                            calculated_values[sheet_name][(row_idx + 1, col_idx + 1)] = value
                                else:
                                    # 単一の値の場合
                                    if row_values is not None:
                                        calculated_values[sheet_name][(row_idx + 1, 1)] = row_values
                    
                    print(f"シート '{sheet_name}': {len(calculated_values[sheet_name])}個のセル値を取得")
            
            # ワークブックを閉じる
            wb.close()
            
        finally:
            # アプリケーションを確実に終了
            try:
                app.quit()
            except:
                pass
        
        # 取得できた値があるかチェック
        total_values = sum(len(sheet_values) for sheet_values in calculated_values.values())
        print(f"xlwingsで合計{total_values}個のセル値を取得しました")
        
        return calculated_values if total_values > 0 else None
        
    except ImportError:
        print("xlwingsがインストールされていません。")
        return None
    except Exception as e:
        print(f"Excel計算値取得エラー (xlwings): {e}")
        return None



def excel_to_pixels(excel_width_units: float, is_width: bool = True) -> int:
    """Excelの幅・高さの単位をピクセルに変換
    
    Args:
        excel_width_units: Excelの幅・高さの値
        is_width: Trueの場合は列幅、Falseの場合は行高
    
    Returns:
        ピクセル値
    """
    if is_width:
        # 列幅の変換: Excelの列幅1単位 ≈ 7ピクセル
        # より正確には: 1文字幅 = 7ピクセル（標準フォント）
        return max(int(excel_width_units * 7), 20)  # 最小幅20px
    else:
        # 行高の変換: 1ポイント = 1.33ピクセル
        return max(int(excel_width_units * 1.33), 20)  # 最小高20px

def get_default_dimensions(worksheet) -> tuple:
    """ワークシートのデフォルト列幅と行高を取得
    
    Returns:
        (default_column_width_px, default_row_height_px)
    """
    # デフォルト列幅（Excelのデフォルトは約8.43）
    default_col_width = getattr(worksheet, 'default_column_width', 8.43)
    default_col_width_px = excel_to_pixels(default_col_width, True)
    
    # デフォルト行高（Excelのデフォルトは15ポイント）
    default_row_height = getattr(worksheet, 'default_row_height', 15)
    default_row_height_px = excel_to_pixels(default_row_height, False)
    
    return default_col_width_px, default_row_height_px

def calculate_optimal_column_widths(worksheet, max_row, max_col) -> dict:
    """セル内容に基づいて最適な列幅を計算
    
    Args:
        worksheet: openpyxlワークシート
        max_row: 最大行数
        max_col: 最大列数
    
    Returns:
        列番号をキーとした幅のピクセル値の辞書
    """
    column_widths = {}
    
    for col_idx in range(1, max_col + 1):
        max_length = 0
        column_letter = worksheet.cell(row=1, column=col_idx).column_letter
        
        # 各行の該当列のセル内容の長さを計算
        for row_idx in range(1, max_row + 1):
            cell = worksheet.cell(row=row_idx, column=col_idx)
            if cell.value is not None:
                # セルの値を文字列に変換して長さを計算
                cell_text = str(cell.value)
                
                # 日本語文字の場合は1.5倍の幅を考慮
                japanese_char_count = sum(1 for char in cell_text if ord(char) > 127)
                english_char_count = len(cell_text) - japanese_char_count
                effective_length = english_char_count + (japanese_char_count * 1.5)
                
                max_length = max(max_length, effective_length)
        
        # 最小幅と最大幅を設定
        min_width = 50  # 最小50ピクセル
        max_width = 300  # 最大300ピクセル
        
        # 文字数に基づく幅計算（1文字あたり約8ピクセル + パディング）
        if max_length == 0:
            optimal_width = min_width
        else:
            optimal_width = int(max_length * 8 + 20)  # 文字幅8px + パディング20px
            optimal_width = max(min_width, min(optimal_width, max_width))
        
        column_widths[col_idx] = optimal_width
    
    return column_widths

def calculate_optimal_row_heights(worksheet, max_row, max_col) -> dict:
    """セル内容に基づいて最適な行高を計算
    
    Args:
        worksheet: openpyxlワークシート
        max_row: 最大行数
        max_col: 最大列数
    
    Returns:
        行番号をキーとした高さのピクセル値の辞書
    """
    row_heights = {}
    
    for row_idx in range(1, max_row + 1):
        max_lines = 1
        
        # 行内の全セルで改行数をチェック
        for col_idx in range(1, max_col + 1):
            cell = worksheet.cell(row=row_idx, column=col_idx)
            if cell.value is not None:
                cell_text = str(cell.value)
                lines = cell_text.count('\n') + 1
                max_lines = max(max_lines, lines)
        
        # 行高を計算（基本高さ25px + 追加行ごとに20px）
        base_height = 25
        additional_height = (max_lines - 1) * 20
        row_heights[row_idx] = base_height + additional_height
    
    return row_heights

def main():
    """メイン実行関数"""
    # 使用例
    excel_file = "sample.xlsx"  # 変換したいExcelファイルのパス
    output_file = "output.html"  # 出力HTMLファイルのパス
    
    try:
        # 全シートを変換
        excel_to_html(excel_file, output_file)
        
        # 特定のシートのみ変換する場合
        # excel_to_html(excel_file, output_file, sheet_names=["Sheet1", "Sheet2"])
        
    except FileNotFoundError as e:
        print(f"エラー: {e}")
        print("sample.xlsxファイルを同じディレクトリに配置してください。")
    except Exception as e:
        print(f"変換中にエラーが発生しました: {e}")

if __name__ == "__main__":
    main()

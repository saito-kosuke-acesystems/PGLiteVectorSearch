"""
Excel セルのスタイル関連のユーティリティ関数
"""
import html


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
    import os
    import sys
    
    # プロジェクトルートをPythonパスに追加
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    
    from tools.excelConvert.logics.dimension_utils import excel_to_pixels
    
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
        styles.append("color: #000000")
    
    # 背景色（改善版）
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

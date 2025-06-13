"""
結合セル処理のユーティリティ関数
"""

def get_merged_cell_info(worksheet):
    """
    ワークシートから結合セルの情報を取得
    
    Args:
        worksheet: openpyxlのWorksheetオブジェクト
        
    Returns:
        dict: 結合セル情報
        - merged_ranges: 結合範囲のリスト
        - merged_cells_map: {(row, col): (colspan, rowspan, is_master)} のマップ
    """
    merged_ranges = list(worksheet.merged_cells.ranges)
    merged_cells_map = {}
    
    for merged_range in merged_ranges:
        # 結合範囲の開始・終了位置を取得
        min_row = merged_range.min_row
        max_row = merged_range.max_row
        min_col = merged_range.min_col
        max_col = merged_range.max_col
        
        # 結合されるセルの数を計算
        colspan = max_col - min_col + 1
        rowspan = max_row - min_row + 1
        
        print(f"結合セル検出: {merged_range} (rowspan={rowspan}, colspan={colspan})")
        
        # 結合範囲内の全セルをマップに追加
        for row in range(min_row, max_row + 1):
            for col in range(min_col, max_col + 1):
                is_master = (row == min_row and col == min_col)  # 左上が主セル
                
                if is_master:
                    # 主セル（結合の左上）にはcolspan/rowspan情報を設定
                    merged_cells_map[(row, col)] = {
                        'colspan': colspan,
                        'rowspan': rowspan,
                        'is_master': True,
                        'skip': False
                    }
                else:
                    # 結合される他のセルはスキップ対象
                    merged_cells_map[(row, col)] = {
                        'colspan': 1,
                        'rowspan': 1,
                        'is_master': False,
                        'skip': True
                    }
    
    return {
        'merged_ranges': merged_ranges,
        'merged_cells_map': merged_cells_map
    }


def should_skip_cell(row_idx, col_idx, merged_cells_map):
    """
    指定されたセルをスキップするかどうかを判定
    
    Args:
        row_idx: 行インデックス
        col_idx: 列インデックス
        merged_cells_map: 結合セル情報のマップ
        
    Returns:
        bool: スキップする場合はTrue
    """
    cell_key = (row_idx, col_idx)
    if cell_key in merged_cells_map:
        return merged_cells_map[cell_key]['skip']
    return False


def get_cell_merge_attributes(row_idx, col_idx, merged_cells_map):
    """
    指定されたセルの結合属性（colspan, rowspan）を取得
    
    Args:
        row_idx: 行インデックス
        col_idx: 列インデックス
        merged_cells_map: 結合セル情報のマップ
        
    Returns:
        str: HTML属性文字列（例: ' colspan="2" rowspan="3"'）
    """
    cell_key = (row_idx, col_idx)
    if cell_key in merged_cells_map and merged_cells_map[cell_key]['is_master']:
        merge_info = merged_cells_map[cell_key]
        attrs = []
        
        if merge_info['colspan'] > 1:
            attrs.append(f'colspan="{merge_info["colspan"]}"')
        if merge_info['rowspan'] > 1:
            attrs.append(f'rowspan="{merge_info["rowspan"]}"')
            
        return ' ' + ' '.join(attrs) if attrs else ''
    
    return ''


def get_merged_cell_value(worksheet, row_idx, col_idx, merged_cells_map, calculated_values, sheet_name):
    """
    結合セルの値を適切に取得
    結合セルの場合は主セル（左上）の値を使用
    
    Args:
        worksheet: openpyxlのWorksheetオブジェクト
        row_idx: 行インデックス
        col_idx: 列インデックス
        merged_cells_map: 結合セル情報のマップ
        calculated_values: 計算結果の辞書
        sheet_name: シート名
        
    Returns:
        str: セルの値
    """
    cell_key = (row_idx, col_idx)
    
    # 結合セルの場合は主セルの値を取得
    if cell_key in merged_cells_map:
        merge_info = merged_cells_map[cell_key]
        if merge_info['is_master']:
            # 主セルの場合は通常通り処理
            cell = worksheet.cell(row=row_idx, column=col_idx)
        else:
            # 結合される他のセルの場合は空文字を返す（スキップされるため実際には使用されない）
            return ""
    else:
        # 通常のセル
        cell = worksheet.cell(row=row_idx, column=col_idx)
    
    # セルの値を取得
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
        cell_value = str(cell_value)
    
    return cell_value

"""
Excel 計算関連のユーティリティ関数
"""


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

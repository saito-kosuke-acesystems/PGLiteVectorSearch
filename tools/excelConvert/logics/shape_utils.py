"""
Excelファイルから図形を抽出してHTMLに変換するユーティリティ
"""
import os
import base64
import io
from io import BytesIO
from typing import Dict, List, Tuple, Optional
from openpyxl import Workbook
from openpyxl.drawing.image import Image
import xml.etree.ElementTree as ET

def get_sheet_shapes(worksheet) -> List[Dict]:
    """
    ワークシートから図形情報を取得
    
    Args:
        worksheet: openpyxlのワークシートオブジェクト
    
    Returns:
        List[Dict]: 図形情報のリスト
    """
    shapes = []
    
    print(f"ワークシート属性をチェック中...")
    print(f"  _images属性: {hasattr(worksheet, '_images')}")
    print(f"  _charts属性: {hasattr(worksheet, '_charts')}")
    print(f"  _drawing属性: {hasattr(worksheet, '_drawing')}")
    
    try:
        # 画像を取得
        if hasattr(worksheet, '_images') and worksheet._images:
            print(f"画像を{len(worksheet._images)}個発見")
            for i, image in enumerate(worksheet._images):
                try:
                    shape_info = extract_image_info(image)
                    if shape_info:
                        shapes.append(shape_info)
                        print(f"画像{i+1}を検出: {shape_info['name']} at ({shape_info['col']}, {shape_info['row']})")
                except Exception as e:
                    print(f"画像{i+1}の処理中にエラー: {e}")
        else:
            print("画像が見つかりませんでした")
    except AttributeError:
        print("このワークシートには_images属性がありません")
    except Exception as e:
        print(f"画像取得でエラー: {e}")
    
    try:
        # チャート/グラフを取得
        if hasattr(worksheet, '_charts') and worksheet._charts:
            print(f"チャートを{len(worksheet._charts)}個発見")
            for i, chart in enumerate(worksheet._charts):
                try:
                    shape_info = extract_chart_info(chart)
                    if shape_info:
                        shapes.append(shape_info)
                        print(f"チャート{i+1}を検出: {shape_info['name']} at ({shape_info['col']}, {shape_info['row']})")
                except Exception as e:
                    print(f"チャート{i+1}の処理中にエラー: {e}")
        else:
            print("チャートが見つかりませんでした")
    except AttributeError:
        print("このワークシートには_charts属性がありません")
    except Exception as e:
        print(f"チャート取得でエラー: {e}")
    
    try:
        # 描画オブジェクト（図形）を取得
        if hasattr(worksheet, '_drawing') and worksheet._drawing:
            drawing = worksheet._drawing
            print(f"描画オブジェクトを発見")
            print(f"  _raw_data属性: {hasattr(drawing, '_raw_data')}")
            if hasattr(drawing, '_raw_data') and drawing._raw_data:
                print(f"  _raw_dataサイズ: {len(drawing._raw_data)} bytes")
                drawing_shapes = extract_drawing_shapes(drawing)
                shapes.extend(drawing_shapes)
                print(f"描画図形を{len(drawing_shapes)}個検出")
            else:
                print("描画データが空です")
        else:
            print("描画オブジェクトが見つかりませんでした")
    except AttributeError:
        print("このワークシートには_drawing属性がありません")
    except Exception as e:
        print(f"描画オブジェクトの処理中にエラー: {e}")
    
    # ワークブックレベルでの図形チェック
    try:
        workbook = worksheet.parent
        print(f"ワークブック属性をチェック中...")
        if hasattr(workbook, '_images'):
            print(f"ワークブックレベル画像: {len(workbook._images) if workbook._images else 0}個")
        if hasattr(workbook, 'drawings'):
            print(f"ワークブック描画: {len(workbook.drawings) if workbook.drawings else 0}個")
    except Exception as e:
        print(f"ワークブックレベルチェックでエラー: {e}")
    
    print(f"合計{len(shapes)}個の図形を検出しました")
    return shapes

def extract_image_info(image) -> Optional[Dict]:
    """
    画像オブジェクトから情報を抽出
    
    Args:
        image: openpyxlの画像オブジェクト
    
    Returns:
        Dict: 画像情報
    """
    try:
        # 位置とサイズ情報を取得
        anchor = image.anchor
        
        # アンカー情報から位置を計算
        if hasattr(anchor, '_from'):
            from_info = anchor._from
            col = from_info.col if hasattr(from_info, 'col') else 0
            row = from_info.row if hasattr(from_info, 'row') else 0
            col_off = from_info.colOff if hasattr(from_info, 'colOff') else 0
            row_off = from_info.rowOff if hasattr(from_info, 'rowOff') else 0
        else:
            col, row, col_off, row_off = 0, 0, 0, 0
        
        # 画像データをbase64エンコード
        img_data = image.ref.getvalue()
        img_base64 = base64.b64encode(img_data).decode('utf-8')
        
        # ファイル形式を推測
        if img_data.startswith(b'\x89PNG'):
            img_format = 'png'
        elif img_data.startswith(b'\xff\xd8'):
            img_format = 'jpeg'
        elif img_data.startswith(b'GIF'):
            img_format = 'gif'
        elif img_data.startswith(b'BM'):
            img_format = 'bmp'
        else:
            img_format = 'png'  # デフォルト
        
        return {
            'type': 'image',
            'col': col,
            'row': row,
            'col_offset': col_off,
            'row_offset': row_off,
            'width': getattr(image, 'width', 100),
            'height': getattr(image, 'height', 100),
            'data': img_base64,
            'format': img_format,
            'name': getattr(image, 'name', 'image')
        }
    except Exception as e:
        print(f"画像情報の抽出中にエラー: {e}")
        return None

def extract_chart_info(chart) -> Optional[Dict]:
    """
    チャートオブジェクトから情報を抽出
    
    Args:
        chart: openpyxlのチャートオブジェクト
    
    Returns:
        Dict: チャート情報
    """
    try:
        anchor = chart.anchor
        
        # アンカー情報から位置を計算
        if hasattr(anchor, '_from'):
            from_info = anchor._from
            col = from_info.col if hasattr(from_info, 'col') else 0
            row = from_info.row if hasattr(from_info, 'row') else 0
            col_off = from_info.colOff if hasattr(from_info, 'colOff') else 0
            row_off = from_info.rowOff if hasattr(from_info, 'rowOff') else 0
        else:
            col, row, col_off, row_off = 0, 0, 0, 0
        
        # サイズ情報
        if hasattr(anchor, 'to'):
            to_info = anchor.to
            to_col = to_info.col if hasattr(to_info, 'col') else col + 5
            to_row = to_info.row if hasattr(to_info, 'row') else row + 5
        else:
            to_col, to_row = col + 5, row + 5
        
        return {
            'type': 'chart',
            'col': col,
            'row': row,
            'col_offset': col_off,
            'row_offset': row_off,
            'to_col': to_col,
            'to_row': to_row,
            'chart_type': type(chart).__name__,
            'name': getattr(chart, 'title', 'Chart') if hasattr(chart, 'title') and chart.title else 'Chart'
        }
    except Exception as e:
        print(f"チャート情報の抽出中にエラー: {e}")
        return None

def extract_drawing_shapes(drawing) -> List[Dict]:
    """
    描画オブジェクトから図形を抽出
    
    Args:
        drawing: openpyxlの描画オブジェクト
    
    Returns:
        List[Dict]: 図形情報のリスト
    """
    shapes = []
    
    try:
        # XMLデータを解析して図形を抽出
        if hasattr(drawing, '_raw_data') and drawing._raw_data:
            root = ET.fromstring(drawing._raw_data)
            
            # 名前空間の定義
            namespaces = {
                'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
                'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'
            }
            
            # 図形要素を検索
            for shape_elem in root.findall('.//xdr:sp', namespaces):
                shape_info = parse_shape_element(shape_elem, namespaces)
                if shape_info:
                    shapes.append(shape_info)
    
    except Exception as e:
        print(f"描画図形の抽出中にエラー: {e}")
    
    return shapes

def parse_shape_element(shape_elem, namespaces) -> Optional[Dict]:
    """
    XML要素から図形情報を解析
    
    Args:
        shape_elem: XML要素
        namespaces: 名前空間辞書
    
    Returns:
        Dict: 図形情報
    """
    try:
        # 位置情報を取得
        anchor = shape_elem.getparent()
        from_elem = anchor.find('xdr:from', namespaces)
        to_elem = anchor.find('xdr:to', namespaces)
        
        if from_elem is not None:
            col = int(from_elem.find('xdr:col', namespaces).text or 0)
            row = int(from_elem.find('xdr:row', namespaces).text or 0)
            col_off = int(from_elem.find('xdr:colOff', namespaces).text or 0)
            row_off = int(from_elem.find('xdr:rowOff', namespaces).text or 0)
        else:
            col, row, col_off, row_off = 0, 0, 0, 0
        
        if to_elem is not None:
            to_col = int(to_elem.find('xdr:col', namespaces).text or col + 2)
            to_row = int(to_elem.find('xdr:row', namespaces).text or row + 2)
            to_col_off = int(to_elem.find('xdr:colOff', namespaces).text or 0)
            to_row_off = int(to_elem.find('xdr:rowOff', namespaces).text or 0)
        else:
            to_col, to_row, to_col_off, to_row_off = col + 2, row + 2, 0, 0
        
        # 図形の種類を判定
        shape_type = 'rectangle'  # デフォルト
        
        # テキスト内容を取得
        text_content = ''
        text_elems = shape_elem.findall('.//a:t', namespaces)
        for text_elem in text_elems:
            if text_elem.text:
                text_content += text_elem.text
        
        # スタイル情報を取得
        style_info = extract_shape_style(shape_elem, namespaces)
        
        return {
            'type': 'shape',
            'shape_type': shape_type,
            'col': col,
            'row': row,
            'col_offset': col_off,
            'row_offset': row_off,
            'to_col': to_col,
            'to_row': to_row,
            'to_col_offset': to_col_off,
            'to_row_offset': to_row_off,
            'text': text_content,
            'style': style_info
        }
    
    except Exception as e:
        print(f"図形要素の解析中にエラー: {e}")
        return None

def extract_shape_style(shape_elem, namespaces) -> Dict:
    """
    図形のスタイル情報を抽出
    
    Args:
        shape_elem: 図形のXML要素
        namespaces: 名前空間辞書
    
    Returns:
        Dict: スタイル情報
    """
    style = {
        'fill_color': '#FFFFFF',
        'border_color': '#000000',
        'border_width': 1,
        'font_size': 11,
        'font_color': '#000000'
    }
    
    try:
        # 塗りつぶし色を取得
        solid_fill = shape_elem.find('.//a:solidFill/a:srgbClr', namespaces)
        if solid_fill is not None and 'val' in solid_fill.attrib:
            style['fill_color'] = f"#{solid_fill.attrib['val']}"
        
        # 境界線色を取得
        line_fill = shape_elem.find('.//a:ln/a:solidFill/a:srgbClr', namespaces)
        if line_fill is not None and 'val' in line_fill.attrib:
            style['border_color'] = f"#{line_fill.attrib['val']}"
        
        # 境界線幅を取得
        line_elem = shape_elem.find('.//a:ln', namespaces)
        if line_elem is not None and 'w' in line_elem.attrib:
            # EMUからピクセルに変換 (1 EMU = 1/914400 inch, 1 inch = 96 px)
            emu_width = int(line_elem.attrib['w'])
            style['border_width'] = max(1, round(emu_width / 914400 * 96))
        
        # フォント情報を取得
        font_elem = shape_elem.find('.//a:defRPr', namespaces)
        if font_elem is not None:
            if 'sz' in font_elem.attrib:
                # フォントサイズ（1/100 pt単位）
                style['font_size'] = int(font_elem.attrib['sz']) / 100
        
        # フォント色を取得
        font_color = shape_elem.find('.//a:defRPr/a:solidFill/a:srgbClr', namespaces)
        if font_color is not None and 'val' in font_color.attrib:
            style['font_color'] = f"#{font_color.attrib['val']}"
    
    except Exception as e:
        print(f"スタイル情報の抽出中にエラー: {e}")
    
    return style

def convert_emu_to_pixels(emu_value: int) -> float:
    """
    EMU（English Metric Units）をピクセルに変換
    
    Args:
        emu_value: EMU値
    
    Returns:
        float: ピクセル値
    """
    # 1 EMU = 1/914400 inch, 1 inch = 96 pixels
    # ただし、0の場合は0を返す
    if emu_value == 0:
        return 0.0
    return emu_value / 914400.0 * 96.0

def calculate_shape_position(col: int, row: int, col_offset: int, row_offset: int, 
                           column_widths: List[float], row_heights: List[float]) -> Tuple[float, float]:
    """
    図形の絶対位置を計算
    
    Args:
        col: 列インデックス
        row: 行インデックス
        col_offset: 列内オフセット（EMU）
        row_offset: 行内オフセット（EMU）
        column_widths: 列幅のリスト（ピクセル）
        row_heights: 行高のリスト（ピクセル）
    
    Returns:
        Tuple[float, float]: (left, top) ピクセル位置
    """
    # 列位置を計算
    left = 0.0
    if col < len(column_widths):
        left = sum(column_widths[:col])
    elif column_widths:
        left = sum(column_widths)
    
    left += convert_emu_to_pixels(col_offset)
    
    # 行位置を計算
    top = 0.0
    if row < len(row_heights):
        top = sum(row_heights[:row])
    elif row_heights:
        top = sum(row_heights)
    
    top += convert_emu_to_pixels(row_offset)
    
    return left, top

def calculate_shape_size(from_col: int, from_row: int, to_col: int, to_row: int,
                        from_col_off: int, from_row_off: int, to_col_off: int, to_row_off: int,
                        column_widths: List[float], row_heights: List[float]) -> Tuple[float, float]:
    """
    図形のサイズを計算
    
    Args:
        from_col, from_row: 開始位置
        to_col, to_row: 終了位置
        from_col_off, from_row_off: 開始オフセット
        to_col_off, to_row_off: 終了オフセット
        column_widths: 列幅のリスト
        row_heights: 行高のリスト
    
    Returns:
        Tuple[float, float]: (width, height) ピクセルサイズ
    """
    # 開始位置を計算
    start_left, start_top = calculate_shape_position(from_col, from_row, from_col_off, from_row_off, column_widths, row_heights)
    
    # 終了位置を計算
    end_left, end_top = calculate_shape_position(to_col, to_row, to_col_off, to_row_off, column_widths, row_heights)
    
    # サイズを計算
    width = max(10, end_left - start_left)  # 最小幅10px
    height = max(10, end_top - start_top)   # 最小高10px
    
    return width, height

def get_sheet_shapes_alternative(worksheet) -> List[Dict]:
    """
    代替方法でワークシートから図形情報を取得
    
    Args:
        worksheet: openpyxlのワークシートオブジェクト
    
    Returns:
        List[Dict]: 図形情報のリスト
    """
    shapes = []
    
    try:
        # ワークシートのすべての属性をチェック
        attrs = dir(worksheet)
        drawing_attrs = [attr for attr in attrs if 'draw' in attr.lower() or 'image' in attr.lower() or 'chart' in attr.lower()]
        print(f"描画関連属性: {drawing_attrs}")
        
        # 直接drawing属性を探す
        for attr in attrs:
            try:
                value = getattr(worksheet, attr)
                if hasattr(value, '__len__') and len(value) > 0:
                    print(f"属性 {attr}: {type(value)} (長さ: {len(value)})")
            except:
                pass
        
        # 図形を含む可能性のあるテキストボックスなどを探す
        for row in worksheet.iter_rows():
            for cell in row:
                if hasattr(cell, 'comment') and cell.comment:
                    print(f"コメント付きセル発見: {cell.coordinate}")
                    
        # ワークシートのXMLデータから直接図形を探す
        if hasattr(worksheet, '_drawing') and worksheet._drawing:
            drawing = worksheet._drawing
            print(f"描画オブジェクトの詳細:")
            print(f"  タイプ: {type(drawing)}")
            print(f"  属性: {dir(drawing)}")
            
            # XMLデータがある場合
            if hasattr(drawing, '_raw_data'):
                try:
                    import xml.etree.ElementTree as ET
                    root = ET.fromstring(drawing._raw_data)
                    print(f"XMLルート要素: {root.tag}")
                    print(f"XML名前空間: {root.attrib}")
                    
                    # すべての子要素をチェック
                    for child in root:
                        print(f"  子要素: {child.tag}")
                        if len(list(child)) > 0:
                            for subchild in child:
                                print(f"    孫要素: {subchild.tag}")
                except Exception as e:
                    print(f"XML解析エラー: {e}")
    
    except Exception as e:
        print(f"代替図形検出でエラー: {e}")
    
    return shapes

def get_sheet_shapes_deep_inspection(worksheet) -> List[Dict]:
    """
    より深いレベルでの図形検出
    """
    shapes = []
    
    try:
        # ワークブックファイルのZIP構造を直接調査
        workbook = worksheet.parent
        if hasattr(workbook, 'path') and workbook.path:
            print(f"Excelファイルパス: {workbook.path}")
            
            # ZIPとしてExcelファイルを開く
            import zipfile
            import tempfile
            
            # ファイルが実際に存在するかチェック
            file_path = None
            if hasattr(workbook, '_archive'):
                # openpyxlのアーカイブオブジェクトから取得
                print("ワークブックアーカイブから調査中...")
                archive = workbook._archive
                
                # アーカイブの内容をリスト
                file_list = archive.namelist()
                print(f"アーカイブ内ファイル数: {len(file_list)}")
                
                # 描画関連ファイルを探す
                drawing_files = [f for f in file_list if 'drawing' in f.lower()]
                print(f"描画関連ファイル: {drawing_files}")
                
                # 画像関連ファイルを探す
                media_files = [f for f in file_list if f.startswith('xl/media/')]
                print(f"メディアファイル: {media_files}")
                
                # 各描画ファイルの内容を調査
                for drawing_file in drawing_files:
                    try:
                        content = archive.read(drawing_file)
                        print(f"{drawing_file}: {len(content)} bytes")
                        
                        # XMLとして解析
                        import xml.etree.ElementTree as ET
                        root = ET.fromstring(content)
                        
                        # 名前空間を取得
                        namespaces = {}
                        for event, elem in ET.iterparse(io.BytesIO(content), events=['start-ns']):
                            prefix, uri = event
                            namespaces[prefix] = uri
                        
                        print(f"  名前空間: {namespaces}")
                        
                        # 図形要素を検索
                        shape_elements = []
                        for elem in root.iter():
                            if 'shape' in elem.tag.lower() or 'pic' in elem.tag.lower():
                                shape_elements.append(elem.tag)
                        
                        if shape_elements:
                            print(f"  図形要素: {set(shape_elements)}")
                            
                            # 実際の図形を解析
                            parsed_shapes = parse_drawing_xml(content, namespaces)
                            shapes.extend(parsed_shapes)
                        
                    except Exception as e:
                        print(f"{drawing_file}の解析エラー: {e}")
    
    except Exception as e:
        print(f"深い検査でエラー: {e}")
    
    return shapes

def parse_drawing_xml(xml_content, namespaces):
    """
    描画XMLを解析して図形情報を抽出
    """
    shapes = []
    
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_content)
        
        # テキストボックスを検索
        for textbox in root.iter():
            if 'textbox' in textbox.tag.lower() or 'txbx' in textbox.tag.lower():
                print(f"テキストボックス発見: {textbox.tag}")
                
                # テキスト内容を取得
                text_content = ""
                for text_elem in textbox.iter():
                    if text_elem.text:
                        text_content += text_elem.text
                
                if text_content.strip():
                    shapes.append({
                        'type': 'textbox',
                        'text': text_content.strip(),
                        'col': 0,  # デフォルト位置
                        'row': 0,
                        'col_offset': 0,
                        'row_offset': 0,
                        'to_col': 2,
                        'to_row': 1,
                        'to_col_offset': 0,
                        'to_row_offset': 0,
                        'style': {
                            'fill_color': '#F0F0F0',
                            'border_color': '#808080',
                            'border_width': 1,
                            'font_size': 11,
                            'font_color': '#000000'
                        }
                    })
                    print(f"テキストボックス追加: {text_content[:50]}...")
        
        # 図形（shape）を検索
        for shape in root.iter():
            if shape.tag.endswith('}sp') or 'shape' in shape.tag.lower():
                print(f"図形発見: {shape.tag}")
                
                # 図形の詳細を解析
                shape_info = parse_shape_xml_element(shape, namespaces)
                if shape_info:
                    shapes.append(shape_info)
        
        # 画像を検索
        for pic in root.iter():
            if pic.tag.endswith('}pic') or 'picture' in pic.tag.lower():
                print(f"画像発見: {pic.tag}")
                
                # 画像の詳細を解析（実際の画像データは別途必要）
                shapes.append({
                    'type': 'placeholder_image',
                    'name': 'Excel Image',
                    'col': 0,
                    'row': 0,
                    'col_offset': 0,
                    'row_offset': 0,
                    'width': 100,
                    'height': 50
                })
    
    except Exception as e:
        print(f"XML解析エラー: {e}")
    
    return shapes

def parse_shape_xml_element(shape_elem, namespaces):
    """
    XML図形要素を解析
    """
    try:
        # テキスト内容を取得
        text_content = ""
        for text_elem in shape_elem.iter():
            if text_elem.text:
                text_content += text_elem.text
        
        return {
            'type': 'shape',
            'shape_type': 'rectangle',
            'text': text_content.strip(),
            'col': 0,
            'row': 0,
            'col_offset': 0,
            'row_offset': 0,
            'to_col': 3,
            'to_row': 1,
            'to_col_offset': 0,
            'to_row_offset': 0,
            'style': {
                'fill_color': '#E6E6E6',
                'border_color': '#404040',
                'border_width': 1,
                'font_size': 11,
                'font_color': '#000000'
            }
        }
    
    except Exception as e:
        print(f"図形要素解析エラー: {e}")
        return None

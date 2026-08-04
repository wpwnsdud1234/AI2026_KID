import csv
import json
import os

def convert():
    csv_file = '전국어린이보호구역표준데이터.csv'
    out_dir = 'public/data'
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, 'schools.json')

    schools = []
    with open(csv_file, 'r', encoding='cp949') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            lat_str = row.get('위도', '').strip()
            lng_str = row.get('경도', '').strip()
            try:
                lat = float(lat_str)
                lng = float(lng_str)
                if not (33.0 <= lat <= 39.5 and 124.0 <= lng <= 132.0):
                    continue
            except (ValueError, TypeError):
                continue

            cctv_yn = row.get('CCTV설치여부', 'N').strip().upper()
            if cctv_yn not in ['Y', 'N']:
                cctv_yn = 'N'

            cctv_cnt_str = row.get('CCTV설치대수', '0').strip()
            try:
                cctv_cnt = int(float(cctv_cnt_str)) if cctv_cnt_str else 0
            except ValueError:
                cctv_cnt = 0

            road_width = row.get('보호구역도로폭', '').strip()
            if not road_width:
                road_width = '정보없음'

            item = {
                'id': i + 1,
                'name': row.get('대상시설명', '').strip() or '어린이보호구역',
                'type': row.get('시설종류', '').strip() or '기타',
                'road_addr': row.get('소재지도로명주소', '').strip(),
                'jibun_addr': row.get('소재지지번주소', '').strip(),
                'lat': round(lat, 6),
                'lng': round(lng, 6),
                'police': row.get('관할경찰서명', '').strip() or '정보없음',
                'cctv_yn': cctv_yn,
                'cctv_cnt': cctv_cnt,
                'road_width': road_width,
                'agency': row.get('관리기관명', '').strip() or '정보없음'
            }
            schools.append(item)

    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(schools, f, ensure_ascii=False)

    print(f"Successfully converted {len(schools)} records to {out_file}")

if __name__ == '__main__':
    convert()

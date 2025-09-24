'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { QRCodeCanvas } from 'qrcode.react';

// ──────────────────────────────────────────────
// Leaflet（地図）はブラウザ専用なので dynamic import（SSR 無効）
// ──────────────────────────────────────────────
const MapContainer: any = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer: any     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const Marker: any        = dynamic(() => import('react-leaflet').then(m => m.Marker),        { ssr: false });
const Popup: any         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });

// ──────────────────────────────────────────────
// Leaflet のピン表示修正（ビルド後にピン画像が出ない対策）
// ──────────────────────────────────────────────
function useLeafletIconFix() {
  useEffect(() => {
    (async () => {
      const L = await import('leaflet');
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });
      (await import('leaflet')).Marker.prototype.options.icon = icon;
    })();
  }, []);
}

// ──────────────────────────────────────────────
/** 多言語テキスト（型付き） */
// ──────────────────────────────────────────────
const dict = {
  ja: {
    title: '御城印マップ',
    subtitle: '御城印がもらえるお城を地図で検索',
    search: '検索',
    region: '地方',
    prefecture: '都道府県',
    all: 'すべて',
    data: 'データ',
    addFromCSV: 'CSV読み込み',
    qr: 'QRコード',
    openHere: 'このページを開く',
    lang: '言語',
    stampAvailable: '御城印あり',
    moreInfo: '詳細',
    filter: '絞り込み',
  },
  en: {
    title: 'Gojoin Castle Map',
    subtitle: 'Find castles offering Gojoin (castle stamps)',
    search: 'Search',
    region: 'Region',
    prefecture: 'Prefecture',
    all: 'All',
    data: 'Data',
    addFromCSV: 'Import CSV',
    qr: 'QR Code',
    openHere: 'Open this page',
    lang: 'Language',
    stampAvailable: 'Gojoin available',
    moreInfo: 'Details',
    filter: 'Filter',
  },
  zh: {
    title: '御城印地图',
    subtitle: '在地图上查找可领取御城印的城堡',
    search: '搜索',
    region: '地区',
    prefecture: '都道府县',
    all: '全部',
    data: '数据',
    addFromCSV: '导入CSV',
    qr: '二维码',
    openHere: '打开此页面',
    lang: '语言',
    stampAvailable: '可领取御城印',
    moreInfo: '详情',
    filter: '筛选',
  },
} as const;

type Lang = keyof typeof dict;             // 'ja' | 'en' | 'zh'
type TKey = keyof (typeof dict)['ja'];     // 各辞書キー
const t = (lang: Lang, key: TKey) => dict[lang][key];

// ──────────────────────────────────────────────
/** 地方・都道府県 */
// ──────────────────────────────────────────────
const PREFS: Record<string, string[]> = {
  '北海道・東北': ['北海道','青森','岩手','宮城','秋田','山形','福島'],
  '関東': ['東京','神奈川','千葉','埼玉','茨城','栃木','群馬'],
  '甲信越': ['山梨','長野','新潟'],
  '北陸': ['富山','石川','福井'],
  '東海': ['静岡','愛知','岐阜','三重'],
  '近畿': ['京都','滋賀','大阪','兵庫','奈良','和歌山'],
  '中国': ['鳥取','島根','岡山','広島','山口'],
  '四国': ['香川','徳島','愛媛','高知'],
  '九州・沖縄': ['福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'],
};

// ──────────────────────────────────────────────
/** 種データ（CSVで差し替え可能） */
// ──────────────────────────────────────────────
const SEED = [
  { id:'matsumoto', name_ja:'松本城', name_en:'Matsumoto Castle', name_zh:'松本城', prefecture:'長野', region:'甲信越', lat:36.2381, lng:137.9680, url:'https://www.matsumoto-castle.jp/', gojoin_url:'https://www.matsumoto-castle.jp/topics/8063.html' },
  { id:'kumamoto',  name_ja:'熊本城', name_en:'Kumamoto Castle',  name_zh:'熊本城', prefecture:'熊本', region:'九州・沖縄', lat:32.8067, lng:130.7056, url:'https://castle.kumamoto-guide.jp/', gojoin_url:'https://kumamoto-icb.or.jp/%E7%86%8A%E6%9C%AC%E5%9F%8E%E3%80%8C%E5%BE%A1%E5%9F%8E%E5%8D%B0%E3%80%8D%E3%81%AE%E3%81%94%E7%B4%B9%E4%BB%8B/' },
  { id:'hirosaki',  name_ja:'弘前城', name_en:'Hirosaki Castle',   name_zh:'弘前城', prefecture:'青森', region:'北海道・東北', lat:40.6081, lng:140.4612, url:'https://www.hirosakipark.jp/', gojoin_url:'https://www.hirosakipark.jp/sakura/cherryblossomfestival/souvenir/goshuin/' },
  { id:'himeji',    name_ja:'姫路城', name_en:'Himeji Castle',     name_zh:'姬路城', prefecture:'兵庫', region:'近畿', lat:34.8394, lng:134.6939, url:'https://www.city.himeji.lg.jp/castle/', gojoin_url:'https://www.himeji-kanko.jp/event/1612/' },
  { id:'hamamatsu', name_ja:'浜松城', name_en:'Hamamatsu Castle',  name_zh:'滨松城', prefecture:'静岡', region:'東海', lat:34.7179, lng:137.7238, url:'https://hamamatsu-jyo.jp/', gojoin_url:'https://shizuoka.hellonavi.jp/gojyoin' },
];

// ──────────────────────────────────────────────
/** URLハッシュ永続化（言語や検索条件をURLに保持→QRで共有可） */
// ──────────────────────────────────────────────
function useHashState(key: string, initial: string) {
  const [state, setState] = useState<string>(() => {
    if (typeof window === 'undefined') return initial;
    const hash = new URLSearchParams(window.location.hash.replace('#','?'));
    return hash.get(key) || initial;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.hash.replace('#','?'));
    state == null ? sp.delete(key) : sp.set(key, state);
    window.location.hash = sp.toString();
  }, [key, state]);
  return [state, setState] as const;
}

// ──────────────────────────────────────────────
export default function Page() {
  useLeafletIconFix();

  const [lang, setLang] = useHashState('lang', 'ja');
  const [q, setQ] = useHashState('q', '');
  const [region, setRegion] = useHashState('region', '');
  const [pref, setPref] = useHashState('pref', '');
  const [data, setData] = useState(SEED);

  const filtered = useMemo(() => data.filter(d => {
    if (region && d.region !== region) return false;
    if (pref && d.prefecture !== pref) return false;
    if (q) {
      const s = `${d.name_ja} ${d.name_en} ${d.name_zh}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [data, q, region, pref]);

  const center: [number, number] = [36.2048, 138.2529];

  const onCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines.shift()!.split(',');
    const rows = lines.map(line => {
      const cols = line.split(',');
      const o: any = {}; headers.forEach((h,i)=> o[h.trim()] = cols[i]?.trim());
      return {
        id:o.id, name_ja:o.name_ja, name_en:o.name_en, name_zh:o.name_zh,
        prefecture:o.prefecture, region:o.region,
        lat:parseFloat(o.lat), lng:parseFloat(o.lng), url:o.url, gojoin_url:o.gojoin_url
      };
    }).filter((r:any)=>!Number.isNaN(r.lat) && !Number.isNaN(r.lng));
    if (rows.length) setData(rows);
  };

  return (
    <div style={{minHeight:'100vh', background:'linear-gradient(#fff,#f8fafc)'}}>
      <div style={{maxWidth:1200, margin:'0 auto', padding:'16px'}}>
        {/* ヘッダー */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
          <div>
            <h1 style={{fontSize:28, fontWeight:700}}>{t(lang as Lang,'title')}</h1>
            <p style={{color:'#475569'}}>{t(lang as Lang,'subtitle')}</p>
          </div>
          <div>
            <select value={lang} onChange={e => setLang(e.target.value as Lang)}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
        </div>

        {/* コントロール */}
        <div style={{display:'grid', gridTemplateColumns:'1fr', gap:12, marginTop:12}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, alignItems:'center'}}>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder={`${t(lang as Lang,'search')}...`} />
            <select value={region} onChange={e=>{ setRegion(e.target.value); setPref(''); }}>
              <option value="">{t(lang as Lang,'all')}</option>
              {Object.keys(PREFS).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={pref} onChange={e=>setPref(e.target.value)}>
              <option value="">{t(lang as Lang,'all')}</option>
              {(region ? PREFS[region] : Object.values(PREFS).flat()).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <label style={{fontSize:12, opacity:.7}}>{t(lang as Lang,'addFromCSV')}</label>
              <input type="file" accept=".csv" onChange={e=> e.target.files && onCSV(e.target.files[0])} />
            </div>
          </div>

          {/* QR */}
          <div style={{display:'flex', gap:12, alignItems:'center'}}>
            <span style={{fontSize:12, opacity:.7}}>{t(lang as Lang,'qr')}</span>
            <QRCodeCanvas value={typeof window!=='undefined' ? window.location.href : ''} size={72} includeMargin />
            <button onClick={()=> navigator.clipboard.writeText(window.location.href)}>{t(lang as Lang,'openHere')}</button>
          </div>

          {/* 地図 */}
          <div style={{height:'70vh', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 8px rgba(0,0,0,.08)'}}>
            <MapContainer center={center} zoom={5} scrollWheelZoom style={{height:'100%', width:'100%'}}>
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {filtered.map((c:any) => (
                <Marker key={c.id} position={[c.lat, c.lng] as [number, number]}>
                  <Popup>
                    <div>
                      <div style={{fontWeight:700}}>
                        {lang==='ja' ? c.name_ja : lang==='en' ? c.name_en : c.name_zh}
                      </div>
                      <div style={{fontSize:12, color:'#15803d'}}>✅ {t(lang as Lang,'stampAvailable')}</div>
                      <div style={{fontSize:12, color:'#475569'}}>{c.prefecture} / {c.region}</div>
                      <div style={{display:'flex', gap:8, marginTop:4}}>
                        <a href={c.url} target="_blank" rel="noreferrer">Official</a>
                        <a href={c.gojoin_url} target="_blank" rel="noreferrer">{t(lang as Lang,'moreInfo')}</a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* リスト（確認用） */}
          <div>
            <h3 style={{fontWeight:600}}>{t(lang as Lang,'data')}</h3>
            <p style={{fontSize:12, color:'#64748b'}}>CSV: id,name_ja,name_en,name_zh,prefecture,region,lat,lng,url,gojoin_url</p>
            <ul style={{maxHeight:200, overflow:'auto', fontSize:14, display:'grid', gap:6}}>
              {filtered.map((c:any) => (
                <li key={c.id} style={{padding:8, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8}}>
                  <div style={{fontWeight:500}}>{c.name_ja} / {c.name_en}</div>
                  <div style={{fontSize:12, color:'#64748b'}}>{c.prefecture}・{c.region}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer style={{fontSize:12, color:'#64748b', marginTop:16}}>
          Tiles © OpenStreetMap. Icons © Leaflet. Seed includes Matsumoto, Kumamoto, Hirosaki, Himeji, Hamamatsu.
        </footer>
      </div>
    </div>
  );
}

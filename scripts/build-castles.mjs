import fetch from 'node-fetch';
import cheerio from 'cheerio';
import pLimit from 'p-limit';
import fs from 'fs/promises';

const BASE = 'https://www.oshironavi.com';
const INDEX = `${BASE}/data/`;

// 一覧ページから各城ページのURLを集める
async function collectCastleLinks() {
  const html = await (await fetch(INDEX)).text();
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/^\/data\/[^\/]+\/?$/.test(href) && !href.includes('index') && !href.includes('about')) {
      links.add(new URL(href, BASE).href.replace(/\/$/, ''));
    }
  });
  return [...links];
}

// 各城ページから城名（と可能なら公式リンク）を取得
async function parseCastlePage(url) {
  try {
    const html = await (await fetch(url)).text();
    const $ = cheerio.load(html);
    let name = $('h1').first().text().trim()
      || $('title').text().replace(/｜.*$/, '').trim();
    name = name.replace(/（.*?）/g, '').replace(/\s+/g, ' ').trim();
    let off = $('a[href^="http"]').filter((_,a)=>/公式|サイト|城|city|pref|tourism|kanko|go\.jp/i.test($(a).text()+$(a).attr('href'))).first().attr('href') || '';
    return { name, url, official: off };
  } catch {
    return null;
  }
}

// 緯度経度（Nominatim 無料API。礼儀として 1 件ずつ）
const limit = pLimit(1);
async function geocode(name) {
  const q = encodeURIComponent(`${name} 日本 城`);
  const api = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${q}&limit=1`;
  const res = await limit(async () => {
    await new Promise(r => setTimeout(r, 1200)); // 1.2秒間隔
    return fetch(api, { headers: { 'User-Agent': 'gojyouin-map/1.0 (contact: example@example.com)' }});
  });
  const js = await res.json();
  if (!js.length) return null;
  return { lat: parseFloat(js[0].lat), lng: parseFloat(js[0].lon) };
}

// 県・地方（簡易推定）
const PREFS = ['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川',
  '新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山',
  '鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'];
const REGION = {
  '北海道・東北': ['北海道','青森','岩手','宮城','秋田','山形','福島'],
  '関東': ['茨城','栃木','群馬','埼玉','千葉','東京','神奈川'],
  '甲信越': ['山梨','長野','新潟'],
  '北陸': ['富山','石川','福井'],
  '東海': ['岐阜','静岡','愛知','三重'],
  '近畿': ['滋賀','京都','大阪','兵庫','奈良','和歌山'],
  '中国': ['鳥取','島根','岡山','広島','山口'],
  '四国': ['徳島','香川','愛媛','高知'],
  '九州・沖縄': ['福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'],
};
function guessPrefRegion(name) {
  const prefecture = PREFS.find(p => name.includes(p)) || '';
  const region = prefecture ? Object.entries(REGION).find(([_, arr]) => arr.includes(prefecture))?.[0] || '' : '';
  return { prefecture, region };
}

// 実行
(async () => {
  console.log('collecting links...');
  const links = await collectCastleLinks();
  console.log('links:', links.length);

  const castles = [];
  for (const url of links) {
    const meta = await parseCastlePage(url);
    if (!meta || !meta.name) continue;
    const geo = await geocode(meta.name);
    const { prefecture, region } = guessPrefRegion(meta.name);
    castles.push({
      id: url.split('/').slice(-1)[0],
      name_ja: meta.name,
      name_en: meta.name, // まずは日本語と同じ
      name_zh: meta.name, // まずは日本語と同じ
      prefecture,
      region,
      lat: geo?.lat ?? '',
      lng: geo?.lng ?? '',
      url: meta.official || url,
      gojoin_url: '' // 後で手で追記OK
    });
  }

  const header = 'id,name_ja,name_en,name_zh,prefecture,region,lat,lng,url,gojoin_url';
  const lines = castles.map(c =>
    [c.id,c.name_ja,c.name_en,c.name_zh,c.prefecture,c.region,c.lat,c.lng,c.url,c.gojoin_url]
      .map(v => String(v ?? '').replace(/,/g,'')).join(',')
  );
  await fs.writeFile('public/castles.csv', [header, ...lines].join('\n'), 'utf8'); // ← 直接 public/ に出力
  console.log('done -> public/castles.csv');
})();

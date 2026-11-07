// GET /api/matches  → مباريات اليوم والغد من API-Football
// المفتاح كيتقرا من متغير بيئة (API_FOOTBALL_KEY) وما كيوصل أبداً للمتصفح.

const API = 'https://v3.football.api-sports.io';
const TZ = 'Africa/Casablanca';

// id ديال البطولة في API-Football  →  الاسم اللي كيبان في الموقع
const LEAGUES = {
  200: 'الدوري المغربي',
  2: 'دوري أبطال أوروبا',
  39: 'الدوري الإنجليزي',
  140: 'الدوري الإسباني',
  12: 'دوري أبطال إفريقيا',
};

// كل يوم = طلب واحد لـ API-Football. 0 = اليوم، 1 = غداً، -1 = البارح
const DAY_OFFSETS = [0, 1];

// مدة الكاش (بالثواني) — كتحمي الكوطا ديالك. تقدر تبدلها من متغير CACHE_SECONDS
const CACHE = Number(process.env.CACHE_SECONDS) || 120;

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE', 'SUSP']);
const DONE = new Set(['FT', 'AET', 'PEN']);
const SKIP = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);

const day = (off) =>
  new Date(Date.now() + off * 864e5).toLocaleDateString('en-CA', { timeZone: TZ });

const json = (body, status = 200, ttl = CACHE) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': ttl
        ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}`
        : 'no-store',
    },
  });

export default async () => {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    console.error('API_FOOTBALL_KEY is not set');
    return json({ error: 'server_not_configured' }, 500, 0);
  }

  try {
    const results = await Promise.all(
      DAY_OFFSETS.map((o) =>
        fetch(`${API}/fixtures?date=${day(o)}&timezone=${TZ}`, {
          headers: { 'x-apisports-key': key },
        }).then((r) => r.json())
      )
    );

    const errors = results
      .map((r) => r.errors)
      .filter((e) => e && (Array.isArray(e) ? e.length : Object.keys(e).length));
    if (errors.length) console.error('API-Football errors:', JSON.stringify(errors));
    if (errors.length === results.length) return json({ error: 'upstream_error' }, 502, 0);

    const seen = new Set();
    const matches = results
      .flatMap((r) => r.response || [])
      .filter(
        (x) =>
          LEAGUES[x.league.id] &&
          !SKIP.has(x.fixture.status.short) &&
          !seen.has(x.fixture.id) &&
          seen.add(x.fixture.id)
      )
      .map((x) => {
        const s = x.fixture.status.short;
        return {
          id: 'f' + x.fixture.id,
          lg: LEAGUES[x.league.id],
          h: x.teams.home.name,
          a: x.teams.away.name,
          hl: x.teams.home.logo,
          al: x.teams.away.logo,
          t: x.fixture.date,
          st: LIVE.has(s) ? 'live' : DONE.has(s) ? 'finished' : 'upcoming',
          min: x.fixture.status.elapsed,
          hs: x.goals.home ?? 0,
          as: x.goals.away ?? 0,
          venue: x.fixture.venue?.name || '',
        };
      });

    return json({ matches, updated: new Date().toISOString() });
  } catch (e) {
    console.error('matches function failed:', e);
    return json({ error: 'internal_error' }, 500, 0);
  }
};

export const config = { path: '/api/matches' };

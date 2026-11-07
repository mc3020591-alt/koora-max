
// KOORA MAX - Netlify Function
// GET /api/matches

const API = 'https://v3.football.api-sports.io';
const TZ = 'Africa/Casablanca';

const LEAGUES = {
  39: 'PL',
  140: 'PD',
  135: 'SA',
  78: 'BL1',
  61: 'FL1',
  2: 'CL',
  200: 'BOT',
  307: 'SPL',
  186: 'ALG',
  202: 'TUN',
  233: 'EGY',
  12: 'CAF'
};

const LIVE = new Set([
  '1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'
]);

const DONE = new Set([
  'FT', 'AET', 'PEN', 'AWD', 'WO'
]);

const SKIP = new Set([
  'PST', 'CANC', 'ABD', 'SUSP'
]);

const json = (body, code = 200, ttl = 1800) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'Netlify-CDN-Cache-Control':
        `public, s-maxage=${ttl}, stale-while-revalidate=60`
    }
  });

const getDay = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);

  return date.toLocaleDateString('en-CA', {
    timeZone: TZ
  });
};

export default async (request) => {
  const key = Netlify.env.get('API_FOOTBALL_KEY');

  if (!key) {
    return json({ error: 'missing_api_key' }, 500, 0);
  }

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get('days')) || 2;
  const days = Math.min(Math.max(requestedDays, 1), 3);

  const ttl = Math.max(
    60,
    Number(Netlify.env.get('TTL')) || 1800
  );

  const allLeagues = Netlify.env.get('ALL_LEAGUES') === '1';
  const matches = new Map();

  try {
    for (let i = 0; i < days; i++) {
      const date = getDay(i);

      const response = await fetch(
        `${API}/fixtures?date=${date}&timezone=${TZ}`,
        {
          headers: {
            'x-apisports-key': key
          }
        }
      );

      if (!response.ok) {
        return json({ error: 'upstream_error' }, 502, 0);
      }

      const data = await response.json();

      if (
        data.errors &&
        Object.keys(data.errors).length > 0
      ) {
        return json({ error: 'upstream_error' }, 502, 0);
      }

      for (const f of data.response || []) {
        const leagueCode = LEAGUES[f.league.id];
        const shortStatus = f.fixture.status.short;

        if (!leagueCode && !allLeagues) continue;
        if (SKIP.has(shortStatus)) continue;

        matches.set(f.fixture.id, {
          id: f.fixture.id,
          lg: leagueCode || f.league.name,
          h: f.teams.home.name,
          a: f.teams.away.name,
          t: f.fixture.date,
          st: LIVE.has(shortStatus)
            ? 'live'
            : DONE.has(shortStatus)
              ? 'finished'
              : 'upcoming',
          min: f.fixture.status.elapsed ?? null,
          hs: f.goals.home ?? 0,
          as: f.goals.away ?? 0,
          venue: f.fixture.venue?.name || '',
          hl: f.teams.home.logo || '',
          al: f.teams.away.logo || ''
        });
      }
    }

    return json({
      matches: [...matches.values()],
      updated: new Date().toISOString()
    }, 200, ttl);

  } catch (error) {
    console.error('KOORA MAX matches error:', error);
    return json({ error: 'network_error' }, 502, 0);
  }
};

export const config = {
  path: '/api/matches'
};

/* Runs the serverless handlers the way Vercel will, which `node --check`
   cannot do. The last two failures were both runtime-only: a variable used
   before its declaration, and a stale deploy — neither is a syntax error, so
   both passed every check and died in production.

   Usage:  node test-api.js
   Network calls will fail in a sandbox; what this proves is that the handler
   executes and returns a shaped response rather than throwing. */
const cases = [
  { file:'./api/grid-atlas.js', name:'grid-atlas GET (health)',
    req:{ method:'GET', headers:{} } },
  { file:'./api/grid-atlas.js', name:'grid-atlas POST with address',
    req:{ method:'POST', headers:{}, body:{ address:'600 N Union Ave, Hillside, NJ 07205', sizeMw:3, dealId:'x' } } },
  { file:'./api/grid-atlas.js', name:'grid-atlas POST with coordinates',
    req:{ method:'POST', headers:{}, body:{ lat:40.70879, lng:-74.2437, sizeMw:3, dealId:'x' } } },
  { file:'./api/grid-atlas.js', name:'grid-atlas POST, no locality',
    req:{ method:'POST', headers:{}, body:{ address:'600 N Union Ave', dealId:'x' } } },
  { file:'./api/grid-atlas.js', name:'grid-atlas POST, nothing',
    req:{ method:'POST', headers:{}, body:{} } },
  { file:'./api/score.js', name:'score POST, unconfigured',
    req:{ method:'POST', headers:{}, body:{ dealId:'x', skill:'solar-storage-ntp' } } },
  { file:'./api/score.js', name:'score POST, unknown skill',
    req:{ method:'POST', headers:{}, body:{ dealId:'x', skill:'nope' } } }
];

(async () => {
  let bad = 0;
  for (const c of cases) {
    const handler = require(c.file);
    const res = { _s:0, _j:null,
      status(s){ this._s = s; return this; },
      json(o){ this._j = o; return this; } };
    try {
      await handler(c.req, res);
      const j = res._j || {};
      const shaped = res._s > 0 && (j.error || j.ok || j.score !== undefined || j.build);
      if (!shaped) { bad++; console.log('  FAIL  ' + c.name + '  — no shaped response'); continue; }
      console.log('  ok    ' + String(res._s).padEnd(4) + c.name
        + (j.error ? '  \u2014 ' + String(j.error).slice(0, 62) : ''));
    } catch (e) {
      bad++;
      console.log('  THREW ' + c.name + '  \u2014 ' + (e && e.message));
      console.log('        ' + String(e && e.stack).split('\n')[1]);
    }
  }
  console.log();
  console.log(bad ? bad + ' handler(s) threw — DO NOT DEPLOY' : 'all handlers execute');
  process.exit(bad ? 1 : 0);
})();

const https = require('https');
const options = {
  hostname: 'anime.tonytonychopper.net',
  path: '/v2/TpBxKmjt',
  headers: {
    'Referer': 'https://streaming.tonytonychopper.com/playback/v/ulEPS2eI/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};
https.get(options, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const evalStart = d.indexOf('eval(function(p,a,c,k,e,d)');
    // Find closing of eval() by counting parens (skip strings)
    let depth = 0, evalEnd = evalStart;
    let inStr = false, strChar = '';
    for (let i = evalStart; i < d.length; i++) {
      const ch = d[i];
      if (!inStr && (ch === "'" || ch === '"')) { inStr = true; strChar = ch; }
      else if (inStr && ch === strChar && d[i-1] !== '\\') { inStr = false; }
      else if (!inStr) {
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth < 0) { evalEnd = i + 1; break; } }
      }
    }
    console.log('eval start:', evalStart, 'eval end:', evalEnd);
    console.log('\n=== AFTER EVAL BLOCK ===');
    console.log(d.substring(evalEnd, evalEnd + 4000));
  });
}).on('error', e => console.error(e.message));

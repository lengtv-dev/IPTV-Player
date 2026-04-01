const https = require('https');

const options = {
  hostname: 'anime.tonytonychopper.net',
  path: '/v2/TpBxKmjt',
  headers: {
    'Referer': 'https://streaming.tonytonychopper.com/playback/v/ulEPS2eI/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const evalIdx = data.indexOf('eval(function(p,a,c,k,e,d)');
    if (evalIdx === -1) { console.log('No packer found'); return; }
    const chunk = data.substring(evalIdx);

    // Find args start (after closing brace of function body)
    let depth = 0, argsStart = -1;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === '{') depth++;
      else if (chunk[i] === '}') {
        depth--;
        if (depth === 0) { argsStart = i + 1; break; }
      }
    }

    const argsStr = chunk.substring(argsStart);

    // Extract keywords - find .split('|')
    const splitIdx = argsStr.indexOf(".split('|')");
    if (splitIdx === -1) { console.log('No split found'); return; }

    // Find the string before .split('|')
    let kEnd = splitIdx - 1;
    const kQuote = argsStr[kEnd];
    let kStart = kEnd - 1;
    while (kStart > 0 && argsStr[kStart] !== kQuote) kStart--;

    const keywordsRaw = argsStr.substring(kStart + 1, kEnd);
    const keywords = keywordsRaw.split('|').map(k => Buffer.from(k, 'base64').toString('utf8'));

    console.log('Keywords count:', keywords.length);
    console.log('First 20 keywords:');
    keywords.slice(0, 20).forEach((k, i) => console.log(i + ':', JSON.stringify(k)));

    // Extract packed string (first arg, starts right after opening paren)
    let pStart = 1;
    const pQuote = argsStr[pStart];
    let pEnd = pStart + 1;
    while (pEnd < argsStr.length) {
      if (argsStr[pEnd] === pQuote && argsStr[pEnd - 1] !== '\\') break;
      pEnd++;
    }
    const packedStr = argsStr.substring(pStart + 1, pEnd);
    console.log('\nPacked string first 300:', packedStr.substring(0, 300));

    // The packed string is like: 109.30("31"+"32"+"33"+...)
    // The "N"+"M" are JS string concatenations of keyword indices
    // Decode by replacing each "N" with keywords[N] and stripping the + operators
    const parts = [];
    const re = /"(\d+)"/g;
    let m;
    while ((m = re.exec(packedStr)) !== null) {
      const idx = parseInt(m[1]);
      parts.push(keywords[idx] !== undefined ? keywords[idx] : m[0]);
    }
    const layer1 = parts.join('');

    console.log('\n=== LAYER 1 DECODED (first 300) ===');
    console.log(layer1.substring(0, 300));

    // Now decode layer 2 - it's a standard Dean Edwards packer (base 56, 56 words)
    // Extract: eval(function(p,a,c,k,e,d){...}('packed',56,56,'words'.split('|'),0,{}))
    const l2EvalIdx = layer1.indexOf("eval(function(p,a,c,k,e,d)");
    if (l2EvalIdx === -1) { console.log('No layer 2 packer found'); return; }
    const l2Chunk = layer1.substring(l2EvalIdx);

    // Extract layer2 args
    let l2depth = 0, l2ArgsStart = -1;
    for (let i = 0; i < l2Chunk.length; i++) {
      if (l2Chunk[i] === '{') l2depth++;
      else if (l2Chunk[i] === '}') { l2depth--; if (l2depth === 0) { l2ArgsStart = i + 1; break; } }
    }
    const l2Args = l2Chunk.substring(l2ArgsStart);

    // Extract layer2 keywords
    const l2SplitIdx = l2Args.indexOf(".split('|')");
    let l2kEnd = l2SplitIdx - 1;
    const l2kQuote = l2Args[l2kEnd];
    let l2kStart = l2kEnd - 1;
    while (l2kStart > 0 && l2Args[l2kStart] !== l2kQuote) l2kStart--;
    const l2KeywordsRaw = l2Args.substring(l2kStart + 1, l2kEnd);
    const l2Keywords = l2KeywordsRaw.split('|');
    console.log('\nLayer 2 keywords count:', l2Keywords.length);
    console.log('Layer 2 keywords[44-56]:', l2Keywords.slice(44));

    // Extract layer2 packed string (first arg)
    let l2pStart = 1;
    const l2pQuote = l2Args[l2pStart];
    let l2pEnd = l2pStart + 1;
    while (l2pEnd < l2Args.length) {
      if (l2Args[l2pEnd] === l2pQuote && l2Args[l2pEnd-1] !== '\\') break;
      l2pEnd++;
    }
    const l2Packed = l2Args.substring(l2pStart + 1, l2pEnd);
    const l2Base = 56;

    // Dean Edwards base-N token to index
    function tokenToIndex(token, base) {
      let result = 0;
      for (let i = 0; i < token.length; i++) {
        const ch = token[i];
        const code = ch.charCodeAt(0);
        let val;
        if (code >= 48 && code <= 57) val = code - 48;       // '0'-'9' -> 0-9
        else if (code >= 97 && code <= 122) val = code - 87; // 'a'-'z' -> 10-35
        else val = code - 29;                                  // 'A'-... -> 36+
        result = result * base + val;
      }
      return result;
    }

    // Decode layer 2: replace word tokens with keywords
    const l2Decoded = l2Packed.replace(/\b(\w+)\b/g, (token) => {
      const idx = tokenToIndex(token, l2Base);
      if (idx < l2Keywords.length && l2Keywords[idx] !== '') return l2Keywords[idx];
      return token;
    });

    console.log('\n=== LAYER 2 DECODED (first 2000 chars) ===');
    console.log(l2Decoded.substring(0, 2000));

    // Now implement the runtime algorithm directly to decode the URL
    // From the decoded layer 2, the final step is:
    // eval(function(h,u,n,t,e,r){ ... }("sAtNks...", 4, "AstVNkcrv", 34, 5, 55))
    // We implement it without eval:

    function _0xe57c(d, e, f) {
      const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
      const g = alphabet.split('');
      const h = g.slice(0, e);
      const i = g.slice(0, f);
      const dChars = d.split('').reverse();
      let j = 0;
      for (let c = 0; c < dChars.length; c++) {
        const b = dChars[c];
        const hi = h.indexOf(b);
        if (hi !== -1) j += hi * Math.pow(e, c);
      }
      let k = '';
      while (j > 0) { k = i[j % f] + k; j = Math.floor(j / f); }
      return k || '0';
    }

    // Extract the final eval call parameters from l2Decoded
    const finalEvalMatch = l2Decoded.match(/eval\(function\(h,u,n,t,e,r\)\{.*?\}\("([^"]+)",(\d+),"([^"]+)",(\d+),(\d+),(\d+)\)\)/s);
    if (!finalEvalMatch) {
      console.log('Could not find final eval call, searching manually...');
      const eIdx = l2Decoded.indexOf('eval(function(h,u,n,t,e,r)');
      console.log('eval idx:', eIdx);
      console.log('substr:', l2Decoded.substring(eIdx, eIdx+200));
      return;
    }

    const [, encStr, , sep, tStr, eStr] = finalEvalMatch;
    const t = parseInt(tStr);
    const e = parseInt(eStr);
    const n = sep;

    console.log('n (alphabet):', n);
    console.log('t (offset):', t);
    console.log('e (base):', e);
    console.log('encoded length:', encStr.length);

    // Decode
    let r = '';
    let i = 0;
    const separator = n[e];
    console.log('separator char:', JSON.stringify(separator));

    while (i < encStr.length) {
      let s = '';
      while (i < encStr.length && encStr[i] !== separator) { s += encStr[i]; i++; }
      i++; // skip separator
      // Replace each char in s with its index in n
      for (let j = 0; j < n.length; j++) {
        s = s.split(n[j]).join(String(j));
      }
      const charCode = parseInt(_0xe57c(s, e, 10)) - t;
      r += String.fromCharCode(charCode);
    }

    try {
      const finalResult = decodeURIComponent(escape(r));
      console.log('\n=== FINAL DECODED URL/CODE ===');
      console.log(finalResult);
    } catch(err) {
      console.log('\n=== FINAL DECODED (raw) ===');
      console.log(r);
    }
  });
}).on('error', e => console.error('Error:', e.message));

/*
 * dry_model.js - reads and writes the game's .scene.dry files for the card and event editor.
 *
 * DryModel.parseFile(text)      -> a file model; DryModel.serializeFile(model) -> text.
 *   An unedited file comes back byte for byte. A section that has been edited (section.dirty)
 *   is written out in the house layout: header, properties, a blank line, text, a blank line, choices.
 * DryModel.Effects.parse(value) -> effect rows (simple changes plus verbatim code); .serialize(e) -> value.
 * DryModel.Conditions.parse(value) -> condition rows joined by "all of" / "any of"; .serialize(c) -> value.
 *
 * The line rules follow dendrynexus's parser (node_modules/dendrynexus/lib/parsers/dry.js).
 * Works in the browser (window.DryModel) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DryModel = factory();
}(this, function () {
  'use strict';

  var PROP_RE = /^([A-Za-z][A-Za-z_ -]*[A-Za-z])\s*:\s*([\s\S]*)$/;
  var OPTION_RE = /^(#[\w-]+|@(?:\.+|[\w-])[\w-]*(?:\.[\w-]+)*)(?:\s*:\s*([\s\S]*))?$/;
  var ID_RE = /^[\w-]+(?:\.[\w-]+)*$/;
  var INDENT_RE = /^\s+\S/;

  // The order new properties are written in, so edited files keep the house layout.
  var PROP_ORDER = ['title', 'subtitle', 'is-card', 'is-pinned-card', 'is-special', 'tags', 'card-image', 'face-image',
    'view-if', 'choose-if', 'unavailable-subtitle', 'max-visits', 'priority', 'on-arrival', 'go-to', 'new-page'];

  function normName(n) { return String(n).toLowerCase().replace(/[_ -]/g, ''); }

  function endsInMagic(startsInMagic, line) {
    var s = line.lastIndexOf('{!'), e = line.lastIndexOf('!}');
    if (e > s) return false;
    if (s > e) return true;
    return startsInMagic;
  }

  // ------------------------------------------------------------------ files
  function newSection(id, header) {
    return {id: id, lines: header === null ? [] : [header], props: [], bodyLines: [], options: [], dirty: false};
  }

  function parseFile(text) {
    var lines = text.split('\n');
    var sections = [];
    var errors = [];
    var cur = newSection(null, null);
    sections.push(cur);
    var context = 'properties';
    var seen = {};

    // A property or option, plus its follow-on lines (indented, or inside {! ... !}).
    function gobble(i) {
      var first = lines[i];
      var raw = [first];
      var inMagic = endsInMagic(false, first);
      var j = i + 1;
      for (; j < lines.length; j++) {
        var l = lines[j];
        if (!inMagic && !INDENT_RE.test(l)) break;
        inMagic = endsInMagic(inMagic, l);
        raw.push(l);
      }
      return {raw: raw, next: j};
    }

    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (line.charAt(0) === '#') { cur.lines.push(line); i++; continue; }
      if (line.trim().length === 0) {
        if (context === 'content') context = 'blank-content';
        else if (context === 'properties') context = 'first-content';
        else if (context === 'options') context = null;
        cur.lines.push(line); i++; continue;
      }
      if (line.charAt(0) === '@') {
        var id = line.substr(1).trim();
        if (!ID_RE.test(id)) errors.push({line: i + 1, message: 'Malformed passage id "' + id + '".'});
        if (seen[id]) errors.push({line: i + 1, message: 'Passage "' + id + '" is defined twice.'});
        seen[id] = true;
        cur = newSection(id, line);
        sections.push(cur);
        context = 'properties';
        i++; continue;
      }
      if (line.charAt(0) === '-' && line.charAt(1) !== '-' && (context === 'blank-content' || context === 'first-content')) {
        context = 'options';
      }
      if (context === null) {
        errors.push({line: i + 1, message: 'Text found after the choices of a passage.'});
        cur.lines.push(line); i++; continue;
      }
      if (context === 'blank-content' || context === 'first-content' || context === 'content') {
        if (context === 'blank-content') cur.bodyLines.push('');
        cur.bodyLines.push(line);
        cur.lines.push(line);
        context = 'content';
        i++; continue;
      }
      var g = gobble(i);
      Array.prototype.push.apply(cur.lines, g.raw);
      var joined = g.raw.join('\n');
      if (context === 'properties') {
        var m = PROP_RE.exec(joined.replace(/^\s+/, ''));
        if (!m) errors.push({line: i + 1, message: 'Not a property: "' + line.trim() + '".'});
        else cur.props.push({name: m[1], value: m[2]});
      } else { // options
        var body = joined.substr(1).replace(/^\s+/, '');
        var om = OPTION_RE.exec(body);
        if (om) {
          cur.options.push({target: om[1], label: om[2] === undefined ? '' : om[2], props: []});
        } else {
          var pm = PROP_RE.exec(body);
          if (pm && cur.options.length) cur.options[cur.options.length - 1].props.push({name: pm[1], value: pm[2]});
          else errors.push({line: i + 1, message: 'Not a choice: "' + line.trim() + '".'});
        }
      }
      i = g.next;
    }
    return {sections: sections, errors: errors};
  }

  function bodyText(sec) { return sec.bodyLines.join('\n'); }

  function canonSection(sec) {
    var out = [];
    if (sec.id !== null) out.push('@' + sec.id);
    sec.props.forEach(function (p) { out.push(p.name + ': ' + p.value); });
    var body = bodyText(sec).replace(/^\s*\n/, '').replace(/\s+$/, '');
    if (body.length) {
      if (out.length) out.push('');
      Array.prototype.push.apply(out, body.split('\n'));
    }
    if (sec.options.length) {
      out.push('');
      sec.options.forEach(function (o) {
        out.push('- ' + o.target + (o.label ? ': ' + o.label : ''));
        (o.props || []).forEach(function (p) { out.push('- ' + p.name + ': ' + p.value); });
      });
    }
    out.push('');
    return out;
  }

  function serializeFile(model) {
    var out = [];
    model.sections.forEach(function (sec) {
      Array.prototype.push.apply(out, (sec.dirty || sec.added) ? canonSection(sec) : sec.lines);
    });
    return out.join('\n');
  }

  // ------------------------------------------------------------------ editing helpers
  function findSection(model, id) {
    for (var k = 0; k < model.sections.length; k++) if (model.sections[k].id === id) return model.sections[k];
    return null;
  }

  function getProp(sec, name) {
    var n = normName(name);
    for (var k = 0; k < sec.props.length; k++) if (normName(sec.props[k].name) === n) return sec.props[k].value;
    return undefined;
  }

  function setProp(sec, name, value) {
    var n = normName(name);
    var idx = -1;
    for (var k = 0; k < sec.props.length; k++) if (normName(sec.props[k].name) === n) idx = k;
    var empty = value === undefined || value === null || String(value).trim() === '';
    if (idx >= 0) {
      if (empty) sec.props.splice(idx, 1);
      else if (sec.props[idx].value === value) return;
      else sec.props[idx].value = value;
      sec.dirty = true;
      return;
    }
    if (empty) return;
    var rank = PROP_ORDER.indexOf(name);
    var at = sec.props.length;
    if (rank >= 0) {
      for (var j = 0; j < sec.props.length; j++) {
        var r = PROP_ORDER.indexOf(sec.props[j].name);
        if (r > rank) { at = j; break; }
      }
    }
    sec.props.splice(at, 0, {name: name, value: value});
    sec.dirty = true;
  }

  function setBody(sec, text) {
    var t = String(text).replace(/\r/g, '');
    if (t === bodyText(sec)) return;
    sec.bodyLines = t.length ? t.split('\n') : [];
    sec.dirty = true;
  }

  function addSection(model, id) {
    var sec = newSection(id, '@' + id);
    sec.added = true;
    model.sections.push(sec);
    return sec;
  }

  function removeSection(model, id) {
    var k = model.sections.indexOf(findSection(model, id));
    if (k > 0) model.sections.splice(k, 1);
  }

  // Lines of text that the game would read as something other than text.
  function bodyProblems(text) {
    var probs = [];
    var lines = String(text).split('\n');
    var prevBlank = true;
    lines.forEach(function (l, k) {
      var c = l.charAt(0);
      if (c === '@') probs.push('Line ' + (k + 1) + ' starts with @, which begins a new passage.');
      else if (c === '#') probs.push('Line ' + (k + 1) + ' starts with #, which makes it a hidden comment.');
      else if (c === '-' && l.charAt(1) !== '-' && prevBlank && k > 0) probs.push('Line ' + (k + 1) + ' starts with -, which begins the list of choices.');
      prevBlank = l.trim() === '';
    });
    return probs;
  }

  // ------------------------------------------------------------------ tokenising helpers
  // Split text at top-level separators, skipping quotes and brackets.
  function splitTop(text, isSep) {
    var parts = [], depth = 0, q = null, start = 0;
    for (var k = 0; k < text.length; k++) {
      var c = text.charAt(k);
      if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (depth === 0) {
        var len = isSep(text, k);
        if (len) { parts.push({text: text.slice(start, k), sep: text.substr(k, len)}); start = k + len; k += len - 1; }
      }
    }
    parts.push({text: text.slice(start), sep: ''});
    return parts;
  }

  function balanced(s) {
    var d = 0, q = null;
    for (var k = 0; k < s.length; k++) {
      var c = s.charAt(k);
      if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === '(') d++;
      else if (c === ')') { d--; if (d < 0) return false; }
    }
    return d === 0 && !q;
  }

  // ------------------------------------------------------------------ effects
  var D_ROW = /^([a-zA-Z][\w]*)\s*(\+=|-=|\*=|\/=|=)\s*([\s\S]+?)(?:\s+if\s+([\s\S]+))?$/;
  var JS_ROW = /^(?:if\s*\(([\s\S]+)\)\s*)?Q(?:\.([a-zA-Z_]\w*)|\[\s*(['"])([a-zA-Z_]\w*)\3\s*\])\s*(\+=|-=|\*=|\/=|=)\s*(-?\d+(?:\.\d+)?|"[^"]*"|'[^']*'|true|false|Q\.[a-zA-Z_]\w*)$/;

  // JavaScript statements at the top level of a {! ... !} block.
  function splitJs(code) {
    var stmts = [];
    var k = 0, n = code.length;
    while (k < n) {
      var p = k;
      while (k < n && /\s/.test(code.charAt(k))) k++;
      if (k >= n) return {stmts: stmts, post: code.slice(p)};
      var pre = code.slice(p, k);
      var start = k, depth = 0, q = null, term = '';
      if (code.substr(k, 2) === '//') {
        while (k < n && code.charAt(k) !== '\n') k++;
        stmts.push({pre: pre, text: code.slice(start, k), term: ''});
        continue;
      }
      while (k < n) {
        var c = code.charAt(k);
        if (q) { if (c === '\\') k++; else if (c === q) q = null; k++; continue; }
        if (code.substr(k, 2) === '//') { while (k < n && code.charAt(k) !== '\n') k++; continue; }
        if (code.substr(k, 2) === '/*') { var e = code.indexOf('*/', k + 2); k = e < 0 ? n : e + 2; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; k++; continue; }
        if (c === '(' || c === '[' || c === '{') { depth++; k++; continue; }
        if (c === ')' || c === ']' || c === '}') {
          depth--; k++;
          if (c === '}' && depth === 0) {
            // a block statement ends here unless an else / catch / finally follows, or it is part of an expression
            var rest = code.slice(k).replace(/^\s+/, '');
            if (/^(else|catch|finally)\b/.test(rest)) continue;
            if (/^[;,.)\]]/.test(rest) || /^(=|\+|-|\*|\/|\?|:|&|\|)/.test(rest)) continue;
            if (/^(if|for|while|do|switch|try|function|else)\b/.test(code.slice(start))) break;
          }
          continue;
        }
        if (c === ';' && depth === 0) {
          if (/^\s*else\b/.test(code.slice(k + 1))) { k++; continue; }
          term = ';'; k++; break;
        }
        k++;
      }
      var text = code.slice(start, term ? k - 1 : k);
      stmts.push({pre: pre, text: text, term: term});
    }
    return {stmts: stmts, post: ''};
  }

  function rowFromJs(st) {
    var m = JS_ROW.exec(st.text.replace(/\s+$/, ''));
    if (m && (!m[1] || balanced(m[1]))) {
      return {kind: 'change', q: m[2] || m[4], op: m[5], value: m[6], cond: m[1] ? m[1].trim() : '', pre: st.pre, text: st.text, term: st.term};
    }
    return {kind: 'code', text: st.text, pre: st.pre, term: st.term};
  }

  function rowFromDendry(seg) {
    var t = seg.text.trim();
    var m = D_ROW.exec(t);
    if (m && !/\bif\b/.test(m[3])) {
      return {kind: 'change', q: m[1], op: m[2], value: m[3].trim(), cond: m[4] ? m[4].trim() : '', seg: seg};
    }
    return {kind: 'code', text: t, seg: seg};
  }

  function parseEffects(value) {
    var v = value === undefined || value === null ? '' : String(value);
    var t = v.trim();
    if (!t) return {lang: 'dendry', rows: [], multiline: false};
    var open = t.indexOf('{!');
    if (open === 0 && t.lastIndexOf('!}') === t.length - 2 && t.indexOf('{!', 2) < 0) {
      var inner = t.slice(2, -2);
      var sp = splitJs(inner);
      return {lang: 'js', rows: sp.stmts.map(rowFromJs), post: sp.post, multiline: inner.indexOf('\n') >= 0, original: v};
    }
    if (open >= 0) return {lang: 'raw', rows: [{kind: 'code', text: v}], original: v};
    var segs = splitTop(v, function (s, k) { return s.charAt(k) === ';' ? 1 : 0; }).map(function (p) {
      var lead = /^\s*/.exec(p.text)[0], trail = /\s*$/.exec(p.text.slice(lead.length))[0];
      return {pre: lead, text: p.text.slice(lead.length, p.text.length - trail.length), trail: trail};
    });
    // a trailing semicolon leaves an empty last segment
    var tail = null;
    if (segs.length > 1 && !segs[segs.length - 1].text) tail = segs.pop();
    return {lang: 'dendry', rows: segs.map(rowFromDendry), tail: tail, multiline: false, original: v};
  }

  function changeText(row, lang) {
    if (lang === 'js') {
      return (row.cond ? 'if (' + row.cond + ') ' : '') + 'Q.' + row.q + ' ' + row.op + ' ' + row.value;
    }
    return row.q + ' ' + row.op + ' ' + row.value + (row.cond ? ' if ' + row.cond : '');
  }

  function serializeEffects(e0) {
    var e = {lang: e0.lang, multiline: e0.multiline, post: e0.post, tail: e0.tail,
      rows: e0.rows.filter(function (r) { return r.kind === 'change' ? !!(r.q && String(r.value).trim()) : !!String(r.text).trim(); })};
    if (!e.rows.length) return '';
    if (e.lang === 'raw') return e.rows.map(function (r) { return r.text; }).join(' ');
    if (e.lang === 'js') {
      var nl = e.multiline;
      var s = e.rows.map(function (r, k) {
        var pre = r.pre !== undefined ? r.pre : (nl ? '\n' : ' ');
        if (k === 0 && r.pre === undefined && !nl) pre = ' ';
        var text = r.kind === 'change' && (r.dirty || r.text === undefined) ? changeText(r, 'js') : r.text;
        var term = r.term !== undefined ? r.term : ((/}\s*$/.test(text) || /^\/\//.test(text)) ? '' : ';');
        if (r.kind === 'change' && r.dirty) term = ';';
        return pre + text + term;
      }).join('');
      var post = e.post !== undefined && e.post !== '' ? e.post : (nl ? '\n' : ' ');
      return '{!' + s + post + '!}';
    }
    var parts = e.rows.map(function (r, k) {
      var seg = r.seg || {pre: k ? ' ' : '', trail: ''};
      var text = r.kind === 'change' && (r.dirty || !r.seg) ? changeText(r, 'dendry') : (r.seg && !r.dirty ? r.seg.text : r.text);
      return seg.pre + text + seg.trail;
    });
    return parts.join(';') + (e.tail ? ';' + e.tail.pre + e.tail.text + e.tail.trail : '');
  }

  // Dendry expressions and conditions in JavaScript, for when code is added to a simple line.
  var D_TOKEN = /\s+|<=|>=|!=|==|\+=|-=|\*=|\/=|=|<|>|\+|-|\*|\/|%|\(|\)|,|"[^"]*"|'[^']*'|\d+(?:\.\d+)?|\.\d+|[a-zA-Z][\w]*|\S/g;
  function dendryToJs(expr, isCond) {
    var out = '';
    var toks = String(expr).match(D_TOKEN) || [];
    toks.forEach(function (t) {
      if (/^\s+$/.test(t)) { out += ' '; return; }
      var low = t.toLowerCase();
      if (low === 'and') out += '&&';
      else if (low === 'or') out += '||';
      else if (low === 'not') out += '!';
      else if (low === 'true' || low === 'false') out += low;
      else if (t === '=' && isCond) out += '==';
      else if (t === 'rand') out += 'Math.random';
      else if (t === 'sqrt') out += 'Math.sqrt';
      else if (/^[a-zA-Z]/.test(t)) out += '(Q.' + t + ' || 0)';
      else out += t;
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  // Convert a simple (Dendry) effects line to JavaScript so that code rows can join it.
  function effectsToJs(e) {
    if (e.lang === 'js') return e;
    if (e.lang === 'raw') return null;
    var rows = [];
    for (var k = 0; k < e.rows.length; k++) {
      var r = e.rows[k];
      if (r.kind !== 'change') return null;
      var val = /^-?\d+(\.\d+)?$/.test(r.value) || /^("[^"]*"|'[^']*')$/.test(r.value) ? r.value : dendryToJs(r.value, false);
      var row = {kind: 'change', q: r.q, op: r.op, value: val, cond: r.cond ? dendryToJs(r.cond, true) : '', dirty: true};
      var text = changeText(row, 'js');
      if (JS_ROW.test(text)) rows.push(row);
      else rows.push({kind: 'code', text: (row.cond ? 'if (' + row.cond + ') ' : '') + 'Q.' + r.q + ' ' + r.op + ' (' + val + ')', term: ';'});
    }
    return {lang: 'js', rows: rows, multiline: false};
  }

  // ------------------------------------------------------------------ conditions
  var CMP_RE = /^([a-zA-Z][\w]*)\s*(<=|>=|!=|==|=|<|>)\s*(-?\d+(?:\.\d+)?|"[^"]*"|'[^']*'|[a-zA-Z][\w]*)$/;
  var FLAG_RE = /^(not\s+|NOT\s+)?([a-zA-Z][\w]*)$/;

  function wordSep(word) {
    var re = new RegExp('^\\s+(' + word + '|' + word.toUpperCase() + ')\\s+');
    return function (s, k) {
      if (!/\s/.test(s.charAt(k))) return 0;
      if (k > 0 && /\s/.test(s.charAt(k - 1))) return 0;
      var m = re.exec(s.slice(k));
      return m ? m[0].length : 0;
    };
  }

  function termFromText(t) {
    var s = t.trim();
    var m = CMP_RE.exec(s);
    if (m && !/^(and|or|not)$/i.test(m[1]) && !/^(and|or|not)$/i.test(m[3])) return {kind: 'cmp', q: m[1], op: m[2], value: m[3]};
    m = FLAG_RE.exec(s);
    if (m && !/^(and|or|not|true|false)$/i.test(m[2])) return {kind: 'flag', q: m[2], negate: !!m[1]};
    return {kind: 'raw', text: s};
  }

  function parseConditions(value) {
    var v = value === undefined || value === null ? '' : String(value);
    if (!v.trim()) return {mode: 'all', terms: [], original: v};
    if (v.indexOf('{!') >= 0) return {mode: 'raw', terms: [], text: v, original: v};
    var ands = splitTop(v, wordSep('and'));
    var ors = splitTop(v, wordSep('or'));
    if (ands.length > 1 && ors.length > 1) return {mode: 'raw', terms: [], text: v, original: v};
    var parts = ands.length > 1 ? ands : ors;
    var mode = ands.length > 1 ? 'all' : (ors.length > 1 ? 'any' : 'all');
    return {mode: mode, terms: parts.map(function (p) { return termFromText(p.text); }), original: v};
  }

  function termText(t) {
    if (t.kind === 'cmp') return t.q + ' ' + t.op + ' ' + t.value;
    if (t.kind === 'flag') return (t.negate ? 'not ' : '') + t.q;
    return t.text;
  }

  function serializeConditions(c) {
    if (c.mode === 'raw') return c.text || '';
    var join = c.mode === 'any' ? ' or ' : ' and ';
    return c.terms.filter(function (t) { return t.kind === 'raw' ? String(t.text).trim() : !!t.q && (t.kind === 'flag' || String(t.value).trim()); }).map(function (t) {
      var s = termText(t);
      // a raw term that itself mixes and/or needs brackets
      if (t.kind === 'raw' && (splitTop(s, wordSep('and')).length > 1 || splitTop(s, wordSep('or')).length > 1)) s = '(' + s + ')';
      return s;
    }).join(join);
  }

  // ------------------------------------------------------------------ misc
  function hash(text) {
    var h = 2166136261;
    for (var k = 0; k < text.length; k++) { h ^= text.charCodeAt(k); h = (h * 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8) + ':' + text.length;
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'new';
  }

  // Quality names used in a piece of Dendry logic or JavaScript.
  function qualitiesIn(text) {
    var found = {};
    var s = String(text);
    var js = s.indexOf('{!') >= 0;
    var re = js ? /Q\.([a-zA-Z_]\w*)|Q\[\s*['"]([a-zA-Z_]\w*)['"]\s*\]/g : /"[^"]*"|'[^']*'|\b([a-zA-Z][\w]*)\b/g;
    var m;
    while ((m = re.exec(s))) {
      var name = m[1] || m[2];
      if (!name) continue;
      if (!js && /^(and|or|not|if|then|else|true|false|rand|sqrt|AND|OR|NOT|TRUE|FALSE)$/.test(name)) continue;
      found[name] = true;
    }
    return Object.keys(found);
  }

  return {
    parseFile: parseFile,
    serializeFile: serializeFile,
    findSection: findSection,
    getProp: getProp,
    setProp: setProp,
    bodyText: bodyText,
    setBody: setBody,
    addSection: addSection,
    removeSection: removeSection,
    bodyProblems: bodyProblems,
    normName: normName,
    Effects: {parse: parseEffects, serialize: serializeEffects, toJs: effectsToJs, changeText: changeText, splitJs: splitJs},
    Conditions: {parse: parseConditions, serialize: serializeConditions, termText: termText},
    dendryToJs: dendryToJs,
    hash: hash,
    slug: slug,
    qualitiesIn: qualitiesIn
  };
}));

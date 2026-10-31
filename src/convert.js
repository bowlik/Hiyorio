import AdmZip from 'adm-zip';

const SUBTITLE_EXT = /\.(ass|ssa|srt|vtt)$/i;

// Hiyori může vracet i ZIP archiv – vezmeme z něj první soubor s titulky.
function unpack(buf) {
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) return buf;
  const entry = new AdmZip(buf)
    .getEntries()
    .find((e) => !e.isDirectory && SUBTITLE_EXT.test(e.entryName));
  if (!entry) throw new Error('Archiv neobsahuje soubor s titulky');
  return entry.getData();
}

// Starší české titulky bývají ve windows-1250, novější v UTF-8.
export function decodeText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1250').decode(buf);
  }
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

function srtTime(ms) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

// "0:01:02.34" -> ms
function assTime(value) {
  const m = /^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(value.trim());
  if (!m) return NaN;
  const frac = Number(m[4].padEnd(3, '0'));
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + frac;
}

// "01:02.345" nebo "00:01:02.345" -> ms
function vttTime(value) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(value.trim());
  if (!m) return NaN;
  const frac = Number(m[4].padEnd(3, '0'));
  return ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + frac;
}

function toSrt(cues) {
  return cues
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.text)
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

// Převod ASS/SSA na SRT. Styly a pozicování se ztratí, kreslené
// typesety (\p1) se zahodí, protože by v SRT byly jen nesmyslný text.
export function assToSrt(text) {
  const cues = [];
  let inEvents = false;
  let format = null;
  let last = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^\[.*\]$/.test(line)) {
      inEvents = line.toLowerCase() === '[events]';
      continue;
    }
    if (!inEvents) continue;
    if (/^format\s*:/i.test(line)) {
      format = line.slice(line.indexOf(':') + 1).split(',').map((s) => s.trim().toLowerCase());
      continue;
    }
    if (!format || !/^dialogue\s*:/i.test(line)) continue;

    // Text je poslední pole a smí obsahovat čárky.
    const parts = line.slice(line.indexOf(':') + 1).split(',');
    const fields = parts.slice(0, format.length - 1).map((s) => s.trim());
    fields.push(parts.slice(format.length - 1).join(','));
    const get = (name) => fields[format.indexOf(name)] ?? '';

    const raw = get('text');
    if (/\{[^}]*\\p[1-9][^}]*\}/.test(raw)) continue;

    const cueText = raw
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/g, '\n')
      .replace(/\\n/g, ' ')
      .replace(/\\h/g, ' ')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
    if (!cueText) continue;

    const cue = { start: assTime(get('start')), end: assTime(get('end')), text: cueText };
    // Efekty typu karaoke často opakují stejný řádek několikrát za sebou.
    if (last && last.text === cue.text && last.start === cue.start) continue;
    cues.push(cue);
    last = cue;
  }
  return toSrt(cues);
}

export function vttToSrt(text) {
  const cues = [];
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;
    const [start, rest] = lines[timeIdx].split('-->');
    const end = rest.trim().split(/\s+/)[0];
    const cueText = lines
      .slice(timeIdx + 1)
      .map((l) => l.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join('\n');
    cues.push({ start: vttTime(start), end: vttTime(end), text: cueText });
  }
  return toSrt(cues);
}

// Ze staženého souboru udělá SRT v UTF-8, kterému Stremio rozumí.
export function toSrtText(buf) {
  const text = decodeText(unpack(buf));
  if (/^\s*WEBVTT/.test(text)) return vttToSrt(text);
  if (/^\s*\[Script Info\]/im.test(text) || /^\[Events\]/im.test(text)) return assToSrt(text);
  return text.replace(/\r\n/g, '\n');
}

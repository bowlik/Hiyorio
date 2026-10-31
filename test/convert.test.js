import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assToSrt, decodeText, toSrtText, vttToSrt } from '../src/convert.js';

const ASS = `[Script Info]
Title: test

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.10,0:00:07.00,Default,,0,0,0,,Druhý, s čárkou
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}Ahoj{\\i0}\\Nsvěte
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}Ahoj{\\i0}\\Nsvěte
Dialogue: 0,0:00:02.00,0:00:04.00,Sign,,0,0,0,,{\\p1}m 0 0 l 100 0{\\p0}
Comment: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,poznámka
`;

test('ASS -> SRT: pořadí, tagy, zalomení, čárky, typesety', () => {
  assert.equal(
    assToSrt(ASS),
    '1\n00:00:01,000 --> 00:00:03,500\nAhoj\nsvěte\n\n2\n00:00:05,100 --> 00:00:07,000\nDruhý, s čárkou\n',
  );
});

test('VTT -> SRT', () => {
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.500 align:start\n<i>Ahoj</i>\n';
  assert.equal(vttToSrt(vtt), '1\n00:00:01,000 --> 00:00:02,500\nAhoj\n');
});

test('windows-1250 se převede na správné znaky', () => {
  const buf = Buffer.from([0x9e, 0x6c, 0x75, 0x9d, 0x6f, 0x75, 0xe8, 0x6b, 0xfd]); // žluťoučký
  assert.equal(decodeText(buf), 'žluťoučký');
});

test('SRT projde beze změny (až na konce řádků)', () => {
  const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nAhoj\r\n';
  assert.equal(toSrtText(Buffer.from(srt)), '1\n00:00:01,000 --> 00:00:02,000\nAhoj\n');
});

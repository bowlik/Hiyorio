import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subtitleLabel, subtitleSource } from '../src/subtitles.js';

test('zdroj: Hiyori vs. externí web', () => {
  assert.equal(subtitleSource({ format: 'ass', url: '' }), 'Hiyori');
  assert.equal(subtitleSource({ format: '', url: 'https://www.example.cz/download.php?id=1' }), 'example.cz');
});

test('popisek: release, zdroj, verze, bez diakritiky a závorek', () => {
  assert.equal(
    subtitleLabel({ id: 1, release: '[SubsPlease]', format: 'ass', version: '1.0' }),
    'SubsPlease_Hiyori_v1.0',
  );
  assert.equal(
    subtitleLabel({ id: 2, release: 'Ohys-Raws/NTV', format: '', url: 'https://external.example.sk/x', version: '' }),
    'Ohys-Raws-NTV_external.example.sk',
  );
  assert.equal(subtitleLabel({ id: 3, release: 'Překlad (BD)', format: 'srt' }), 'Preklad-BD_Hiyori');
});

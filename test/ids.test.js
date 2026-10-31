import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStremioId } from '../src/mapping.js';

test('IMDb film a epizoda', () => {
  assert.deepEqual(parseStremioId('tt0245429'), {
    source: 'imdb',
    id: 'tt0245429',
    season: undefined,
    episode: undefined,
  });
  assert.deepEqual(parseStremioId('tt2560140:3:13'), {
    source: 'imdb',
    id: 'tt2560140',
    season: 3,
    episode: 13,
  });
});

test('Kitsu, MAL, AniList', () => {
  assert.deepEqual(parseStremioId('kitsu:7442:5'), { source: 'kitsu', id: 7442, episode: 5 });
  assert.deepEqual(parseStremioId('mal:16498'), { source: 'mal', id: 16498, episode: undefined });
  assert.deepEqual(parseStremioId('anilist:16498:1'), { source: 'anilist', id: 16498, episode: 1 });
});

test('neznámé ID', () => {
  assert.equal(parseStremioId('yt:abc'), null);
  assert.equal(parseStremioId('kitsu:abc'), null);
});

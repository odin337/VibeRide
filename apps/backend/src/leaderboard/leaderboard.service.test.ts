import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { ScoreSubmission } from '@viberide/shared';
import { ALT_AUDIO_HASH, generateLevel, makeBeatMap } from '@viberide/track-generator';
import { beforeEach, describe, expect, it } from 'vitest';

import { AnticheatService } from '../anticheat/anticheat.service';
import type { AuthenticatedPlayer } from '../auth/auth.service';
import { asStoredTrack, buildRun } from '../testing/runs';
import { InMemoryTracksRepository } from '../tracks/tracks.repository';
import { InMemoryLeaderboardRepository } from './leaderboard.repository';
import { LeaderboardService } from './leaderboard.service';

const PLAYER: AuthenticatedPlayer = {
  id: 'guest:device-1',
  displayName: 'Rider One',
  kind: 'guest',
};

const track = asStoredTrack(generateLevel(makeBeatMap()));
const legitimate: ScoreSubmission = buildRun(track.level);

let service: LeaderboardService;

beforeEach(async () => {
  const tracks = new InMemoryTracksRepository();
  await tracks.save(track);
  service = new LeaderboardService(
    tracks,
    new InMemoryLeaderboardRepository(),
    new AnticheatService(),
  );
});

describe('LeaderboardService.submitScore', () => {
  it('accepts a legitimate run and returns the ranked entry', async () => {
    const entry = await service.submitScore(legitimate, PLAYER);
    expect(entry.rank).toBe(1);
    expect(entry.playerId).toBe(PLAYER.id);
    expect(entry.displayName).toBe(PLAYER.displayName);
    expect(entry.score).toBe(legitimate.score);
    expect(entry.audioHash).toBe(legitimate.audioHash);
    expect(Number.isNaN(Date.parse(entry.achievedAt))).toBe(false);
  });

  it('responds 404 for a track that was never registered', async () => {
    const submission = { ...legitimate, audioHash: ALT_AUDIO_HASH };
    await expect(service.submitScore(submission, PLAYER)).rejects.toThrow(NotFoundException);
    await expect(service.submitScore(submission, PLAYER)).rejects.toThrow(/never registered/);
  });

  it('responds 422 naming every failed anti-cheat check', async () => {
    const tampered = { ...legitimate, seed: legitimate.seed + 1, durationMs: 1 };
    await expect(service.submitScore(tampered, PLAYER)).rejects.toThrow(
      UnprocessableEntityException,
    );
    await expect(service.submitScore(tampered, PLAYER)).rejects.toThrow(
      /seed .* does not match .*; .*durationMs/,
    );
  });
});

describe('LeaderboardService.getPage', () => {
  it('delegates to the repository with the parsed query', async () => {
    await service.submitScore(legitimate, PLAYER);
    const page = await service.getPage({ audioHash: legitimate.audioHash, limit: 10 });
    expect(page.audioHash).toBe(legitimate.audioHash);
    expect(page.total).toBe(1);
    expect(page.entries[0]!.playerId).toBe(PLAYER.id);
  });
});

import { FunctionDeclaration, Type } from '@google/genai';

export const TACTICS_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_match_state',
    description:
      '주어진 경기의 특정 분(minute) 시점까지의 스코어와 카드 현황을 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        matchId: { type: Type.INTEGER },
        minute: { type: Type.INTEGER },
      },
      required: ['matchId', 'minute'],
    },
  },
  {
    name: 'get_lineup_at_minute',
    description:
      '주어진 경기의 특정 분(minute) 시점에 양 팀이 그라운드에 내보낸 실제 라인업과 포메이션을 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        matchId: { type: Type.INTEGER },
        minute: { type: Type.INTEGER },
      },
      required: ['matchId', 'minute'],
    },
  },
  {
    name: 'get_player_stats',
    description:
      '한 선수의 2022 월드컵 통산 기록(출전 수, 선발 수, 골, 경고/퇴장, 교체 이력)을 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        playerId: { type: Type.INTEGER },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'get_bench_players',
    description:
      '주어진 경기·팀·시점 기준으로 아직 투입되지 않아 교체로 투입 가능한 벤치 선수 목록을 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        matchId: { type: Type.INTEGER },
        teamId: { type: Type.INTEGER },
        minute: { type: Type.INTEGER },
      },
      required: ['matchId', 'teamId', 'minute'],
    },
  },
  {
    name: 'get_opponent_tendencies',
    description:
      '한 팀이 2022 월드컵에서 주로 사용한 포메이션과 득실점 경향을 조회합니다. 상대 팀 분석에 사용하세요.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        teamId: { type: Type.INTEGER },
      },
      required: ['teamId'],
    },
  },
];

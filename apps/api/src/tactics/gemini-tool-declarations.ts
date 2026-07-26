import { FunctionDeclaration, Type } from '@google/genai';

export const TACTICS_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_match_state',
    description:
      '주어진 경기의 특정 분(minute) 시점까지의 스코어를 조회합니다.',
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
      '한 팀이 이번 대회(같은 커리어)에서 지금까지 치른 경기의 전적과 득실점 경향을 조회합니다. 상대 팀 분석에 사용하세요.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        teamId: { type: Type.INTEGER },
        matchId: { type: Type.INTEGER },
      },
      required: ['teamId', 'matchId'],
    },
  },
  {
    name: 'get_player_attributes',
    description:
      '한 선수의 능력치(속도/슈팅/패스/수비/피지컬/체력, 1-99)를 조회합니다. 교체·전술 선택의 근거로 사용하세요.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        playerId: { type: Type.INTEGER },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'get_team_tactical_profile',
    description:
      '한 팀의 전술 성향(압박강도/점유성향/수비라인 높이, 0-100)을 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        teamId: { type: Type.INTEGER },
      },
      required: ['teamId'],
    },
  },
];

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI, Part } from '@google/genai';
import { TacticsToolsService } from './tactics-tools.service';
import { TACTICS_TOOL_DECLARATIONS } from './gemini-tool-declarations';
import { RecommendTacticsDto } from './dto/recommend-tactics.dto';
import { TacticsRecommendation } from './tactics-recommendation.type';
import { WhatIfScenario } from './what-if-scenario.type';

// A pinned version (previously gemini-2.5-flash) eventually gets sunset
// out from under you - Google retired the whole 2.0 line in June 2026,
// and 2.5-flash stopped being available to this project's key shortly
// after. The rolling "-latest" alias always resolves to Google's current
// GA flash model instead, trading version pinning for not silently
// breaking every time an old model gets retired.
const MODEL = 'gemini-flash-latest';
const MAX_TOOL_TURNS = 6;

const RECOMMEND_SYSTEM_INSTRUCTION = `당신은 2026 월드컵 경기를 분석하는 축구 전술 코치입니다.
사용자가 지정한 경기의 특정 시점(minute)에서, 그 팀의 감독이라면 지금 어떤 포메이션/교체 결정을 내려야 할지 추천합니다.

반드시 아래 도구(tool)들을 필요한 만큼 호출해 실제 데이터를 조회한 뒤 판단하세요:
- get_match_state: 현재 스코어
- get_lineup_at_minute: 지금 그라운드에 있는 양팀 라인업/포메이션
- get_bench_players: 지금 투입 가능한 벤치 선수 명단
- get_opponent_tendencies: 상대팀의 이번 대회 전적/득실점 경향
- get_player_attributes: 선수 능력치(속도/슈팅/패스/수비/피지컬/체력)
- get_team_tactical_profile: 팀 전술 성향(압박강도/점유성향/수비라인)

충분히 조사했다면, 도구 호출 없이 아래 JSON 스키마 "하나만" 코드블록 없이 순수 텍스트로 응답하세요:
{
  "recommendedFormation": "예: 4-3-3" | null,
  "substitutions": [ { "outPlayerId": number, "outName": string, "inPlayerId": number, "inName": string, "reason": string } ],
  "reasoning": "전체 판단 근거 한두 문장",
  "verdictOnUserChange": "사용자가 제안한 변경안이 있을 때만 그것에 대한 한줄 평가, 없으면 null"
}
substitutions에는 반드시 get_bench_players로 실제 투입 가능하다고 확인된 선수만 넣으세요. JSON 외의 다른 텍스트는 출력하지 마세요.`;

const WHAT_IF_SYSTEM_INSTRUCTION = `당신은 2026 월드컵 경기의 "이렇게 했다면?" 시나리오를 만드는 축구 시뮬레이션 작가입니다.
사용자가 특정 시점에 포메이션/교체를 변경했다고 가정하고, 이후 경기가 어떻게 흘러갈지 그럴듯한 "순간(moment)" 시퀀스를 만듭니다.
이 시나리오는 경기 종료까지 이어지는 긴 흐름을 여러 번에 나눠 생성하는 것 중 "한 구간"입니다 - 이번 요청에서는 주어진 시점부터 이어지는 한 구간만 만들면 되고, 그 뒤는 별도 요청에서 계속됩니다.

반드시 아래 도구를 필요한 만큼 호출해 실제 데이터(선수 능력치, 팀 전술 성향, 벤치, 상대 성향, 현재 스코어)를 조회한 뒤 판단하세요:
- get_match_state, get_lineup_at_minute, get_bench_players,
  get_opponent_tendencies, get_player_attributes, get_team_tactical_profile

충분히 조사했다면, 도구 호출 없이 아래 JSON 스키마 "하나만" 코드블록 없이 순수 텍스트로 응답하세요:
{
  "summary": "이 구간 전개에 대한 한두 문장 요약",
  "moments": [
    {
      "offsetSeconds": number,
      "teamId": number,
      "playerId": number,
      "playerName": string,
      "type": "BUILD_UP" | "CHANCE" | "SHOT" | "TURNOVER" | "CLEARANCE",
      "outcome": "Complete" | "Goal" | "Saved" | "Blocked" | "OffTarget" | "Won" | "Lost",
      "zone": "left" | "center" | "right",
      "progress": number,
      "commentary": "짧은 실황 한 줄"
    }
  ],
  "checkpoint": {
    "kind": "FREE_KICK" | "PENALTY",
    "teamId": number,
    "description": "이 상황을 설명하는 한 줄",
    "eligiblePlayers": [ { "playerId": number, "name": string } ]
  } | null
}
규칙: offsetSeconds는 이번 구간의 시작 시점(0)부터 증가하는 값이며 3~5개 정도의 moment로 이번 구간(최대 480초, 약 8분)을 채우세요 - 실제 경기의 1/3 수준 밀도면 충분하니 억지로 채우지 말고, 공수 전환·빌드업·찬스 중 실제로 의미 있는 장면만 골라 구성하세요. playerId는 반드시 get_lineup_at_minute나 get_bench_players로 확인된 실제 선수여야 합니다. TURNOVER/CLEARANCE의 teamId는 볼을 새로 소유하게 된 팀입니다. 이전 구간에서 골이 들어갔다면 그 이후 흐름(리드/추격 심리 등)을 자연스럽게 반영하세요.
zone/progress는 실황 문구가 묘사하는 위치와 반드시 일치해야 합니다 (예: "왼쪽 측면"이라고 썼다면 zone은 반드시 "left", "페널티 박스 안"이면 progress는 85~95 사이). progress는 0(자기 진영 깊숙이)부터 100(상대 골라인)까지이며, BUILD_UP은 대략 10~40, CHANCE는 50~80, SHOT은 80~95, TURNOVER/CLEARANCE는 볼을 새로 따낸 지점(대개 20~50)을 쓰세요. 텍스트와 좌표가 어긋나면 안 됩니다.
체크포인트 규칙: 체크포인트는 반드시 사용자가 관리하는 teamId(analysis 대상 teamId, 위에 명시된 그 팀)가 얻은 세트피스에서만 만드세요 - 상대팀이 얻은 프리킥/페널티는 체크포인트 없이 평소처럼 키커와 결과까지 moments에 바로 만들어서 이어가세요(사용자는 상대팀 선수를 고를 이유가 없습니다). 사용자 팀이 이번 구간 중 아래 두 상황 중 하나를 얻으면, moments를 그 장면까지만 채우고(누가 어떻게 마무리했는지, 그 결과는 절대 만들지 마세요) checkpoint 필드를 채워서 반환하세요.
- FREE_KICK: 위험한 위치(대략 progress 70 이상)에서 파울이 나 직접 프리킥 찬스가 생긴 경우
- PENALTY: 페널티 박스 안에서 파울/핸드볼로 페널티킥이 선언된 경우
eligiblePlayers는 get_lineup_at_minute로 확인한 그 팀 선발 중 (FREE_KICK이면 프리킥을, PENALTY면 페널티킥을) 찰 법한 선수 1~5명입니다. 체크포인트가 없는 구간이면 checkpoint는 반드시 null입니다. 한 구간에 체크포인트는 최대 1개만 만드세요. 사용자가 이미 키커를 선택해 다음 구간을 요청한 경우, 그 선택을 첫 moment(해당 프리킥/페널티킥의 결과, type은 SHOT)로 반영해 이어가세요 - 이 경우 같은 구간에서 새 체크포인트를 또 만들지 마세요. JSON 외의 다른 텍스트는 출력하지 마세요.`;

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly tools: TacticsToolsService) {}

  private getClient(): GoogleGenAI {
    if (this.client) return this.client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on the server',
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  private async runToolLoop(
    systemInstruction: string,
    prompt: string,
  ): Promise<string> {
    const ai = this.getClient();
    const chat = ai.chats.create({
      model: MODEL,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: TACTICS_TOOL_DECLARATIONS }],
        // The what-if final answer asks for a handful of moments per chunk -
        // without an explicit budget, gemini-2.5-flash's default dynamic
        // thinking can eat most of the output token budget before it writes
        // the JSON, truncating it mid-object.
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    let response = await chat.sendMessage({ message: prompt });

    let turn = 0;
    while (
      response.functionCalls &&
      response.functionCalls.length > 0 &&
      turn < MAX_TOOL_TURNS
    ) {
      turn += 1;
      const responseParts: Part[] = [];
      for (const call of response.functionCalls) {
        const result = await this.dispatch(call.name ?? '', call.args ?? {});
        responseParts.push({
          functionResponse: { name: call.name, response: { output: result } },
        });
      }
      response = await chat.sendMessage({ message: responseParts });
    }

    return response.text ?? '';
  }

  async recommend(
    matchId: number,
    opponentTeamId: number,
    dto: RecommendTacticsDto,
  ): Promise<TacticsRecommendation> {
    const prompt = this.buildRecommendPrompt(matchId, opponentTeamId, dto);
    const text = await this.runToolLoop(RECOMMEND_SYSTEM_INSTRUCTION, prompt);
    return this.parseRecommendation(text);
  }

  async generateWhatIfScenario(
    matchId: number,
    opponentTeamId: number,
    dto: RecommendTacticsDto,
    priorSummaries: string[] = [],
  ): Promise<WhatIfScenario> {
    const prompt = this.buildWhatIfPrompt(
      matchId,
      opponentTeamId,
      dto,
      priorSummaries,
    );
    const text = await this.runToolLoop(WHAT_IF_SYSTEM_INSTRUCTION, prompt);
    return this.parseWhatIfScenario(text);
  }

  private buildRecommendPrompt(
    matchId: number,
    opponentTeamId: number,
    dto: RecommendTacticsDto,
  ): string {
    const lines = [
      `matchId=${matchId}, 분석 대상 teamId=${dto.teamId}, 상대 teamId=${opponentTeamId}, 시점 minute=${dto.minute}.`,
    ];
    if (dto.proposedChange) {
      lines.push(
        `사용자가 이런 변경을 고려 중입니다: ${JSON.stringify(dto.proposedChange)}. 이 변경이 타당한지도 verdictOnUserChange에 평가해주세요.`,
      );
    }
    lines.push('위 시점에서 어떤 전술 변경을 추천하는지 분석해주세요.');
    return lines.join('\n');
  }

  private buildWhatIfPrompt(
    matchId: number,
    opponentTeamId: number,
    dto: RecommendTacticsDto,
    priorSummaries: string[],
  ): string {
    const lines = [
      `matchId=${matchId}, 분석 대상 teamId=${dto.teamId}, 상대 teamId=${opponentTeamId}, 시점 minute=${dto.minute}.`,
    ];
    if (
      dto.proposedChange?.formation ||
      dto.proposedChange?.substitutions?.length
    ) {
      lines.push(
        `이 시점에 다음 변경을 적용했습니다: ${JSON.stringify({
          formation: dto.proposedChange.formation,
          substitutions: dto.proposedChange.substitutions,
        })}.`,
      );
    }
    if (dto.proposedChange?.tacticalDial) {
      const { pressingIntensity, possessionStyle, defensiveLine } =
        dto.proposedChange.tacticalDial;
      lines.push(
        `사용자가 teamId=${dto.teamId} 팀의 세부 전술을 직접 조정했습니다 (0~100 척도, 50이 기준): ` +
          `압박 강도 ${pressingIntensity}(${pressingIntensity >= 65 ? '하이프레스' : pressingIntensity <= 35 ? '리트릿/로우블록' : '중간 강도'}), ` +
          `수비 라인 ${defensiveLine}(${defensiveLine >= 65 ? '높은 라인' : defensiveLine <= 35 ? '낮은 라인' : '중간 라인'}), ` +
          `점유 성향 ${possessionStyle}(${possessionStyle >= 65 ? '점유·빌드업 중심' : possessionStyle <= 35 ? '다이렉트·역습 중심' : '균형'}). ` +
          '이 설정이 만들어내는 전형적인 리스크와 이득(예: 하이프레스+높은 라인은 뒷공간을 내주고, 로우블록+다이렉트는 점유를 내주는 대신 안정적)을 실제 전개에 반영하세요.',
      );
    }
    if (!dto.proposedChange) {
      lines.push(
        '이 시점에 teamId 팀에 가장 그럴듯한 다음 전개를 시뮬레이션하세요.',
      );
    }
    if (dto.proposedChange?.checkpointChoice) {
      const { kind, playerId, playerName } = dto.proposedChange.checkpointChoice;
      const label = kind === 'PENALTY' ? '페널티킥' : '프리킥';
      lines.push(
        `직전 구간에서 만들어진 ${label} 체크포인트에 대해 사용자가 키커로 ${playerName}(playerId=${playerId})을(를) 선택했습니다. ` +
          `이 구간의 첫 moment는 반드시 이 선수가 직접 차는 ${label}의 결과여야 합니다(type: SHOT, playerId/playerName은 위 선택 그대로). 이번 구간에서는 새 체크포인트를 만들지 마세요(checkpoint는 null).`,
      );
    }
    if (priorSummaries.length === 0) {
      lines.push(
        '변경 직후부터 이어지는 첫 구간의 moment 시퀀스를 만들어주세요.',
      );
    } else {
      lines.push(
        `지금까지 이 가상 시나리오에서 이미 일어난 일(시간순): ${priorSummaries
          .map((s, i) => `[구간${i + 1}] ${s}`)
          .join(' ')}`,
      );
      lines.push(
        `minute=${dto.minute} 시점부터 그 다음 구간을 자연스럽게 이어서 만들어주세요.`,
      );
    }
    return lines.join('\n');
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      switch (name) {
        case 'get_match_state':
          return await this.tools.getMatchState(
            Number(args.matchId),
            Number(args.minute),
          );
        case 'get_lineup_at_minute':
          return await this.tools.getLineupAtMinute(
            Number(args.matchId),
            Number(args.minute),
          );
        case 'get_bench_players':
          return await this.tools.getBenchPlayers(
            Number(args.matchId),
            Number(args.teamId),
            Number(args.minute),
          );
        case 'get_opponent_tendencies':
          return await this.tools.getOpponentTendencies(
            Number(args.teamId),
            Number(args.matchId),
          );
        case 'get_player_attributes':
          return await this.tools.getPlayerAttributes(Number(args.playerId));
        case 'get_team_tactical_profile':
          return await this.tools.getTeamTacticalProfile(Number(args.teamId));
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      this.logger.warn(`Tool call ${name} failed: ${String(err)}`);
      return { error: String(err) };
    }
  }

  private stripJsonFence(text: string): string {
    const unfenced = text
      .trim()
      .replace(/^```(json)?/i, '')
      .replace(/```$/, '')
      .trim();
    // Gemini occasionally emits a stray trailing comma before a closing
    // brace/bracket, which is invalid JSON - repair it rather than discard
    // an otherwise well-formed response.
    return unfenced.replace(/,(\s*[}\]])/g, '$1');
  }

  private parseRecommendation(text: string): TacticsRecommendation {
    const cleaned = this.stripJsonFence(text);
    try {
      const parsed = JSON.parse(cleaned) as Partial<TacticsRecommendation>;
      return {
        recommendedFormation: parsed.recommendedFormation ?? null,
        substitutions: parsed.substitutions ?? [],
        reasoning: parsed.reasoning ?? cleaned,
        verdictOnUserChange: parsed.verdictOnUserChange ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to parse Gemini response as JSON: ${String(err)}`,
      );
      return {
        recommendedFormation: null,
        substitutions: [],
        reasoning: cleaned || 'AI 응답을 해석하지 못했습니다.',
        verdictOnUserChange: null,
      };
    }
  }

  private parseWhatIfScenario(text: string): WhatIfScenario {
    const cleaned = this.stripJsonFence(text);
    try {
      const parsed = JSON.parse(cleaned) as Partial<WhatIfScenario>;
      return {
        summary: parsed.summary ?? cleaned,
        moments: parsed.moments ?? [],
        checkpoint: parsed.checkpoint ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to parse Gemini what-if response: ${String(err)}`,
      );
      return {
        summary: cleaned || 'AI 응답을 해석하지 못했습니다.',
        moments: [],
        checkpoint: null,
      };
    }
  }
}

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

const MODEL = 'gemini-2.5-flash';
const MAX_TOOL_TURNS = 6;

const RECOMMEND_SYSTEM_INSTRUCTION = `당신은 2022 카타르 월드컵 경기를 분석하는 축구 전술 코치입니다.
사용자가 지정한 경기의 특정 시점(minute)에서, 그 팀의 감독이라면 지금 어떤 포메이션/교체 결정을 내려야 할지 추천합니다.

반드시 아래 도구(tool)들을 필요한 만큼 호출해 실제 데이터를 조회한 뒤 판단하세요:
- get_match_state: 현재 스코어, 카드 현황
- get_lineup_at_minute: 지금 그라운드에 있는 양팀 라인업/포메이션
- get_player_stats: 특정 선수의 이 대회 기록
- get_bench_players: 지금 투입 가능한 벤치 선수 명단
- get_opponent_tendencies: 상대팀의 포메이션/득실점 경향
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

const WHAT_IF_SYSTEM_INSTRUCTION = `당신은 2022 카타르 월드컵 경기의 "이렇게 했다면?" 시나리오를 만드는 축구 시뮬레이션 작가입니다.
사용자가 특정 시점에 포메이션/교체를 변경했다고 가정하고, 이후 몇 분간 경기가 어떻게 흘러갈지 그럴듯한 "순간(moment)" 시퀀스를 만듭니다.

반드시 아래 도구를 필요한 만큼 호출해 실제 데이터(선수 능력치, 팀 전술 성향, 벤치, 상대 성향, 현재 스코어)를 조회한 뒤 판단하세요:
- get_match_state, get_lineup_at_minute, get_player_stats, get_bench_players,
  get_opponent_tendencies, get_player_attributes, get_team_tactical_profile

충분히 조사했다면, 도구 호출 없이 아래 JSON 스키마 "하나만" 코드블록 없이 순수 텍스트로 응답하세요:
{
  "summary": "이 변경 이후 전개에 대한 한두 문장 요약",
  "moments": [
    {
      "offsetSeconds": number,
      "teamId": number,
      "playerId": number,
      "playerName": string,
      "type": "BUILD_UP" | "CHANCE" | "SHOT" | "TURNOVER" | "CLEARANCE",
      "outcome": "Complete" | "Goal" | "Saved" | "Blocked" | "OffTarget" | "Won" | "Lost",
      "commentary": "짧은 실황 한 줄"
    }
  ]
}
규칙: offsetSeconds는 변경 시점(0)부터 증가하는 값이며 4~6개 정도의 moment로 180초 이내로 구성하세요. playerId는 반드시 get_lineup_at_minute나 get_bench_players로 확인된 실제 선수여야 합니다. TURNOVER/CLEARANCE의 teamId는 볼을 새로 소유하게 된 팀입니다. JSON 외의 다른 텍스트는 출력하지 마세요.`;

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

  private async runToolLoop(systemInstruction: string, prompt: string): Promise<string> {
    const ai = this.getClient();
    const chat = ai.chats.create({
      model: MODEL,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: TACTICS_TOOL_DECLARATIONS }],
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
  ): Promise<WhatIfScenario> {
    const prompt = this.buildWhatIfPrompt(matchId, opponentTeamId, dto);
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
  ): string {
    const lines = [
      `matchId=${matchId}, 분석 대상 teamId=${dto.teamId}, 상대 teamId=${opponentTeamId}, 시점 minute=${dto.minute}.`,
    ];
    if (dto.proposedChange) {
      lines.push(
        `이 시점에 다음 변경을 적용했습니다: ${JSON.stringify(dto.proposedChange)}.`,
      );
    } else {
      lines.push('이 시점에 teamId 팀에 가장 그럴듯한 다음 전개를 시뮬레이션하세요.');
    }
    lines.push(
      '변경 직후부터 이후 경기가 어떻게 흘러갈지 moment 시퀀스를 만들어주세요.',
    );
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
        case 'get_player_stats':
          return await this.tools.getPlayerStats(Number(args.playerId));
        case 'get_bench_players':
          return await this.tools.getBenchPlayers(
            Number(args.matchId),
            Number(args.teamId),
            Number(args.minute),
          );
        case 'get_opponent_tendencies':
          return await this.tools.getOpponentTendencies(Number(args.teamId));
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
      this.logger.warn(`Failed to parse Gemini response as JSON: ${String(err)}`);
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
      };
    } catch (err) {
      this.logger.warn(`Failed to parse Gemini what-if response: ${String(err)}`);
      return { summary: cleaned || 'AI 응답을 해석하지 못했습니다.', moments: [] };
    }
  }
}

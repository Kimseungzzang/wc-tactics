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

const MODEL = 'gemini-2.5-flash';
const MAX_TOOL_TURNS = 6;

const SYSTEM_INSTRUCTION = `당신은 2022 카타르 월드컵 경기를 분석하는 축구 전술 코치입니다.
사용자가 지정한 경기의 특정 시점(minute)에서, 그 팀의 감독이라면 지금 어떤 포메이션/교체 결정을 내려야 할지 추천합니다.

반드시 아래 도구(tool)들을 필요한 만큼 호출해 실제 데이터를 조회한 뒤 판단하세요:
- get_match_state: 현재 스코어, 카드 현황
- get_lineup_at_minute: 지금 그라운드에 있는 양팀 라인업/포메이션
- get_player_stats: 특정 선수의 이 대회 기록
- get_bench_players: 지금 투입 가능한 벤치 선수 명단
- get_opponent_tendencies: 상대팀의 포메이션/득실점 경향

충분히 조사했다면, 도구 호출 없이 아래 JSON 스키마 "하나만" 코드블록 없이 순수 텍스트로 응답하세요:
{
  "recommendedFormation": "예: 4-3-3" | null,
  "substitutions": [ { "outPlayerId": number, "outName": string, "inPlayerId": number, "inName": string, "reason": string } ],
  "reasoning": "전체 판단 근거 한두 문장",
  "verdictOnUserChange": "사용자가 제안한 변경안이 있을 때만 그것에 대한 한줄 평가, 없으면 null"
}
substitutions에는 반드시 get_bench_players로 실제 투입 가능하다고 확인된 선수만 넣으세요. JSON 외의 다른 텍스트는 출력하지 마세요.`;

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

  async recommend(
    matchId: number,
    opponentTeamId: number,
    dto: RecommendTacticsDto,
  ): Promise<TacticsRecommendation> {
    const ai = this.getClient();
    const chat = ai.chats.create({
      model: MODEL,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: TACTICS_TOOL_DECLARATIONS }],
      },
    });

    const prompt = this.buildPrompt(matchId, opponentTeamId, dto);
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

    return this.parseRecommendation(response.text ?? '');
  }

  private buildPrompt(
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
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      this.logger.warn(`Tool call ${name} failed: ${String(err)}`);
      return { error: String(err) };
    }
  }

  private parseRecommendation(text: string): TacticsRecommendation {
    const cleaned = text
      .trim()
      .replace(/^```(json)?/i, '')
      .replace(/```$/, '')
      .trim();
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
}

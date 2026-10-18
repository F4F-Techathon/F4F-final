"""Export current per-restaurant prompts without any service credentials."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.console_coordinator import COORDINATOR_PROMPT
from server.console_persona import speech_system
from server.realtime_console import catalog


def main():
    path = ROOT / 'artifacts/current-agent-prompts.json'
    export = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    export.update(
        coordinatorSystemPrompt=COORDINATOR_PROMPT,
        coordinatorInputNote='读取完整SessionView、用户问题、候选原文及conversationBalance；每条候选附本轮selectionRef。调度返回evidenceRefs短码，后端严格映射回原始evidenceIds；无效引用忽略、有效引用去重保留，不设4条硬上限；资料不足重选一次，仍失败则记录恢复并用可读资料继续，不猜测替换错误前缀。动态节奏提醒另附system末尾，summary仅供调试。',
        restaurantInputNote='SessionView包含完整保留历史、状态、偏好、最新用户输入及全场usedAttackPoints；每条评论的criticismPoints标注alreadyUsed；TurnPlan只含行为/对象/关联回合/证据ID/维度/回合身份，不含goal、summary、topic或台词指导；evidence是所分配的完整原文，带归属标注。',
        restaurantRepairInputNote='修正仍使用同一个性化systemPrompt、完整上下文、精简TurnPlan和已分配原文，另附proposal/check/requiredEdits。末尾动态要求含身份标点总长首轮45、后续30字；attack保留对方槽点与对方ID，可舍弃自家卖点；compare保留双方同维度事实与ID。运行时完整提示词以控制台该repair节点为准。',
        restaurantDirectiveKeys=['restaurantId', 'speechAct', 'targetRestaurantId', 'replyTo', 'evidenceIds', 'discussionDimension', 'turnId', 'introduce'],
        restaurants=[],
    )
    for sid in catalog.shops:
        persona = catalog.persona(sid)
        export['restaurants'].append({**persona, 'firstTurnSystemPrompt': speech_system(persona, True),
                                     'subsequentTurnSystemPrompt': speech_system(persona, False)})
    path.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'artifacts/persona-characters.json').write_text(json.dumps([
        {k: v for k, v in p.items() if 'Prompt' not in k} for p in export['restaurants']
    ], ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()

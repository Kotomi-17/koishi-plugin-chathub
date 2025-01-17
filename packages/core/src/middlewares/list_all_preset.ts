import { Context } from 'koishi';
import { Config } from '../config';
import { ChainMiddlewareRunStatus, ChatChain } from '../chain';
import { createLogger } from '../llm-core/utils/logger';
import { Factory } from '../llm-core/chat/factory';
import { preset } from './resolve_preset';

const logger = createLogger("@dingyi222666/chathub/middlewares/list_all_preset")


export function apply(ctx: Context, config: Config, chain: ChatChain) {
    chain.middleware("list_all_preset", async (session, context) => {

        const { command } = context

        if (command !== "listPreset") return ChainMiddlewareRunStatus.SKIPPED

        const buffer = ["以下是目前可用的模型列表"]

        const presets = await preset.getAllPreset()

        presets.forEach((preset) => {
            buffer.push(preset)
        })

        buffer.push("\n你也可以使用 chathub.setpreset <preset> 来设置预设喵")

        context.message = buffer.join("\n")

        return ChainMiddlewareRunStatus.STOP
    }).after("lifecycle-handle_command")
}

declare module '../chain' {
    interface ChainMiddlewareName {
        "list_all_preset": never
    }
}
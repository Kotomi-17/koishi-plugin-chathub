import { Context } from 'koishi';
import { Config } from '../config';
import { ChainMiddlewareRunStatus, ChatChain } from '../chain';
import { createLogger } from '../llm-core/utils/logger';

const logger = createLogger("@dingyi222666/chathub/middlewares/allow_reply")

export function apply(ctx: Context, config: Config, chain: ChatChain) {

    chain.middleware("allow_reply", async (session, context) => {
        // 禁止套娃
        if (ctx.bots[session.uid]) return ChainMiddlewareRunStatus.STOP

        const result =
            // 私聊
            (session.subtype === "private" && config.allowPrivate && context.command != null) ? true :
                //群艾特
                session.parsed.appel && config.allowAtReply ? true :
                    //bot名字
                    session.content.startsWith(config.botName) && config.isNickname ? true :
                        //随机回复
                        Math.random() < config.randomReplyFrequency ? true :
                            //命令
                            context.command != null

        if (!result) {
           // logger.debug(`[unallow_reply] ${session.username}(${session.userId}): ${session.content}`)
        }

        return result ? ChainMiddlewareRunStatus.CONTINUE : ChainMiddlewareRunStatus.STOP

    }).after("lifecycle-check")

}

declare module '../chain' {
    interface ChainMiddlewareName {
        "allow_reply": never
    }
}
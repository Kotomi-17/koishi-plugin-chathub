import { Service, Schema, Context, Logger, Session } from "koishi";
import { Config } from "./config"
import { LLMInjectService } from "./services/injectService"
import { LLMChatService } from './services/chatService';
import { Chat, checkBasicCanReply, checkCooldownTime, createSenderInfo, readChatMessage, replyMessage, createConversationConfig } from "./chat";
import { ChatLimitCache, ChatLimit } from './cache';
import { lookup } from 'dns';

export * from "./config"
export * from "./types"
export * from "./services/chatService"
export * from "./services/injectService"


export const name = "@dingyi222666/chathub"
export const using = ['cache']
const logger = new Logger("@dingyi222666/chathub")
let chat: Chat

let chatLimitCache: ChatLimitCache
let lastChatTime: number = 0




export function apply(ctx: Context, config: Config) {
    ctx.plugin(LLMInjectService)
    ctx.plugin(LLMChatService, config)


    ctx.on('ready', () => {
        chatLimitCache = new ChatLimitCache(ctx, config)
        chat = new Chat(ctx, config)
    })

    ctx.middleware(async (session, next) => {
        // 禁止套娃

        if (!checkBasicCanReply(ctx, session, config)) return next()

        if (!checkCooldownTime(session, config)) return next()

        // 检测输入是否能聊起来
        let input = readChatMessage(session)

        if (input.trim() === '') return next()

        const { senderId, senderName } = createSenderInfo(session, config)


        const chatLimitResult = await resovleChatLimit(session, senderId, config)

        if (chatLimitResult == true) {
            return
        }


        // 先保存一次
        await chatLimitCache.set(senderId, chatLimitResult)


        logger.debug(`[chat] ${senderName}(${senderId}): ${input}`)

        const result = await chat.chat(input, config, senderId, senderName, createConversationConfig(config))
        chatLimitResult.count += 1

        await chatLimitCache.set(senderId, chatLimitResult)

        return result
    })

}

async function resovleChatLimit(session: Session, senderId: string, config: Config) {
    const chatLimit = await session.resolve(config.chatTimeLimit)

    let chatLimitResult = await chatLimitCache.get(senderId)

    if (chatLimitResult) {
        // 如果大于1小时的间隔，就重置
        if (Date.now() - chatLimitResult.time > 1000 * 60 * 60) {
            chatLimitResult = {
                time: Date.now(),
                count: 0
            }
        } else {
            // 用满了
            if (chatLimitResult.count >= chatLimit) {
                const time = Math.ceil((1000 * 60 * 60 - (Date.now() - chatLimitResult.time)) / 1000 / 60)
                session.send(`你已经聊了${chatLimit}次了,超过了限额，休息一下吧（${time}分钟后重试）`)
                return true
            }
        }
    } else {
        chatLimitResult = {
            time: Date.now(),
            count: 0
        }
    }

    return chatLimitResult
}



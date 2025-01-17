import { Context, ForkScope, Logger } from "koishi";

import { createLogger, setLoggerLevel } from "./llm-core/utils/logger";
import { request } from "./llm-core/utils/request";
import { Config } from './config';
import { ChatChain } from './chain';
import { ChatHubService } from './services/chat';
import { middleware } from "./middleware";
import { command } from './command';
import { Cache } from "./cache"


export * from './config'
export const name = "@dingyi222666/chathub"
export const using = ['cache', 'database']

export const usage = `
## chathub v1.0.0 

### 本次更新为重大更新，不兼容旧版本，请卸载后重新配置
### 不向下兼容 0.x 版本的相关适配器和插件，请在升级前卸载相关适配器和插件
### 目前插件还在 alpha 阶段，可能会有很多 bug，可以去插件主页那边提 issue 或加群反馈。

Koishi ChatHub 插件交流群： 282381753

群里目前可能有搭载了该插件的 bot，特可以向我提问插件相关问题

[文档](https://chathub.dingyi222666.top/) 目前也在制作中，有问题可以在群里提出

临时文档可以访问 github 的主页来查看：[chathub](https://github.com/dingyi222666/koishi-plugin-chathub) 或加群询问如何配置

`

let _chain: ChatChain
let _keysCache: Cache<"chathub/keys", string>

export const getChatChain = () => _chain
export const getKeysCache = () => _keysCache

const logger = createLogger("@dingyi222666/chathub")

export function apply(ctx: Context, config: Config) {

    if (config.isLog) {
        setLoggerLevel(Logger.DEBUG)
    }

    const forkScopes: ForkScope[] = []

    ctx.on("ready", async () => {
        // set proxy before init service

        if (config.isProxy) {
            request.globalProxyAdress = config.proxyAddress ?? ctx.http.config.proxyAgent

            logger.debug(`[proxy] ${config.proxyAddress}`)
        }

        _chain = new ChatChain(ctx, config)
        _keysCache = new Cache(ctx, config, "chathub/keys")

        forkScopes.push(ctx.plugin(ChatHubService, config))

        await middleware(ctx, config)
        await command(ctx, config)

        logger.debug(
            JSON.stringify(
                _chain._graph.build().map(node =>
                    node.name)
            )
        )
    })


    // 释放资源
    ctx.on("dispose", () => {
        forkScopes.forEach(scope => scope.dispose())
    })

    ctx.middleware(async (session, next) => {

        if (_chain == null) {
            return next()
        }

        const intercept = await _chain.receiveMessage(session)

        if (!intercept)
            return next()

    })
}

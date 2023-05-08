import { Context } from 'koishi';
import { Config } from '../config';
import fs from 'fs/promises';
import { chain } from './index'
import { ChatChain } from './chain';

export async function apply(ctx: Context, config: Config) {

    const list = await fs.readdir(`${__dirname}/middlewares`)

    for (const file of list) {
        const middleware: {
            apply: (ctx: Context, config: Config, chain: ChatChain) => PromiseLike<void>
        } = await require(`./middlewares/${file}`)

        if (middleware.apply) {
            await middleware.apply(ctx, config, chain)
        }
    }
}
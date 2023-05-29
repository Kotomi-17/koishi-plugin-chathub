import { Context } from 'koishi';
import VectorStorePlugin from '..';
import { ChatHubSaveableVectorStore, CreateVectorStoreRetrieverParams, VectorStoreRetrieverProvider } from '@dingyi222666/chathub-llm-core/lib/model/base';
import { VectorStoreRetriever } from 'langchain/vectorstores/base';
import { FaissStore } from 'langchain/vectorstores/faiss';
import path from 'path';
import fs from 'fs/promises';

export function apply(ctx: Context, config: VectorStorePlugin.Config,
    plugin: VectorStorePlugin) {

    if (!config.faiss) {
        return
    }

    plugin.registerVectorStoreRetrieverProvider(new FaissVectorStoreRetrieverProvider(config))
}

class FaissVectorStoreRetrieverProvider extends VectorStoreRetrieverProvider {

    name = "faiss"
    description = "faiss vector store"

    constructor(private readonly _config: VectorStorePlugin.Config) {
        super();
    }

    isSupported(modelName: string): Promise<boolean> {
        return super.isSupported(modelName)
    }

    async createVectorStoreRetriever(params: CreateVectorStoreRetrieverParams): Promise<VectorStoreRetriever> {
        const embeddings = params.embeddings
        let faissStore: FaissStore

        const directory = this._config.faissSavePath

        const jsonFile = path.join(directory, "docstore.json")


        console.log(`Loading faiss store from ${directory}`)

        try {
            await fs.access(jsonFile)
            faissStore = await FaissStore.load(directory, embeddings)
        } catch {
            faissStore = await FaissStore.fromTexts(['HelloWorld'], [''], embeddings)
        }

        const wrapperStore = new ChatHubSaveableVectorStore(faissStore, (store) => store.save(directory))

        return wrapperStore.asRetriever(this._config.topK)
    }

}
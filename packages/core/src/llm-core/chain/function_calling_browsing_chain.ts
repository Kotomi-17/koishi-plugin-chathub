import { HumanChatMessage, AIChatMessage, ChainValues, SystemChatMessage, ChatGeneration, BaseChatMessage, FunctionChatMessage } from 'langchain/schema';
import { BufferMemory, ConversationSummaryMemory } from "langchain/memory";
import { VectorStoreRetrieverMemory } from 'langchain/memory';
import { ChatHubChain, ChatHubChatModelChain, SystemPrompts } from './base';
import { HumanMessagePromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate } from 'langchain/prompts';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { getEmbeddingContextSize, getModelContextSize } from '../utils/count_tokens';
import { ChatHubBroswingPrompt, ChatHubOpenAIFunctionCallPrompt } from './prompt';
import { Embeddings } from 'langchain/embeddings/base';
import { ChatHubBrowsingAction, ChatHubBrowsingActionOutputParser } from './out_parsers';
import { TokenTextSplitter } from 'langchain/text_splitter';
import { StructuredTool, Tool } from 'langchain/tools';
import { ChatHubBaseChatModel } from '../model/base';
import { createLogger } from '../utils/logger';

const logger = createLogger("@dingyi222666/chathub/llm-core/chain/function_calling_browsing_chain")

export interface ChatHubFunctionCallBrowsingChainInput {
    botName: string;
    systemPrompts?: SystemPrompts
    embeddings: Embeddings

    historyMemory: ConversationSummaryMemory | BufferMemory
}

export class ChatHubFunctionCallBrowsingChain extends ChatHubChain
    implements ChatHubFunctionCallBrowsingChainInput {
    botName: string;

    embeddings: Embeddings;

    searchMemory: VectorStoreRetrieverMemory

    chain: ChatHubChatModelChain;

    historyMemory: ConversationSummaryMemory | BufferMemory

    systemPrompts?: SystemPrompts;

    tools: StructuredTool[];

    constructor({
        botName,
        embeddings,
        historyMemory,
        systemPrompts,
        chain,
        tools
    }: ChatHubFunctionCallBrowsingChainInput & {
        chain: ChatHubChatModelChain;
        tools: StructuredTool[];
    }) {
        super();
        this.botName = botName;

        this.embeddings = embeddings

        // use memory 
        this.searchMemory = new VectorStoreRetrieverMemory({
            vectorStoreRetriever: (new MemoryVectorStore(embeddings).asRetriever(6)),
            memoryKey: "long_history",
            inputKey: "input",
            outputKey: "result",
            returnDocs: true
        });
        this.historyMemory = historyMemory;
        this.systemPrompts = systemPrompts;
        this.chain = chain;
        this.tools = tools
    }

    static fromLLMAndTools(
        llm: ChatHubBaseChatModel,
        tools: Tool[],
        {
            botName,
            embeddings,
            historyMemory,
            systemPrompts,

        }: ChatHubFunctionCallBrowsingChainInput
    ): ChatHubFunctionCallBrowsingChain {

        const humanMessagePromptTemplate = HumanMessagePromptTemplate.fromTemplate("{input}")

        let conversationSummaryPrompt: SystemMessagePromptTemplate
        let messagesPlaceholder: MessagesPlaceholder

        if (historyMemory instanceof ConversationSummaryMemory) {
            conversationSummaryPrompt = SystemMessagePromptTemplate.fromTemplate(`This is some conversation between me and you. Please generate an response based on the system prompt and content below.Current conversation: {chat_history}`)
        } else {
            messagesPlaceholder = new MessagesPlaceholder("chat_history")
        }

        const prompt = new ChatHubOpenAIFunctionCallPrompt({
            systemPrompts: systemPrompts ?? [new SystemChatMessage("You are ChatGPT, a large language model trained by OpenAI. Carefully heed the user's instructions.")],
            conversationSummaryPrompt: conversationSummaryPrompt,
            messagesPlaceholder: messagesPlaceholder,
            tokenCounter: (text) => llm.getNumTokens(text),
            humanMessagePromptTemplate: humanMessagePromptTemplate,
            sendTokenLimit: getModelContextSize(llm._modelType() ?? "gpt2"),
        })

        const chain = new ChatHubChatModelChain({ llm, prompt });

        return new ChatHubFunctionCallBrowsingChain({
            botName,
            embeddings,
            historyMemory,
            systemPrompts,
            chain,
            tools
        });
    }


    private _selectTool(name: string): StructuredTool {
        return this.tools.find((tool) => tool.name === name)
    }

    async call(message: HumanChatMessage): Promise<ChainValues> {
        const requests: ChainValues = {
            input: message.text
        }

        const chatHistory = (await this.historyMemory.loadMemoryVariables(requests))[this.historyMemory.memoryKey] as BaseChatMessage[]

        const loopChatHistory = [...chatHistory]

        requests["chat_history"] = loopChatHistory

        let finalResponse: string

        let loopCount = 0


        while (true) {
            const response = await this.chain.call({
                ...requests,
                tools: this.tools
            });

            const rawGenaration = response["rawGenaration"] as ChatGeneration

            const responseMessage = rawGenaration.message

            logger.debug(`[ChatHubFunctionCallBrowsingChain] response: ${JSON.stringify(responseMessage)}`)

            if (loopCount == 0) {
                loopChatHistory.push(new HumanChatMessage(responseMessage.text))
                requests["input"] = undefined
            }

            loopChatHistory.push(responseMessage)

            if (responseMessage.additional_kwargs?.function_call) {
                const functionCall = responseMessage.additional_kwargs.function_call as {
                    'name'?: string;
                    'arguments'?: string;
                }

                const tool = this._selectTool(functionCall.name)

                let toolResponse: {
                    name: string;
                    content: string;
                }

                try {
                    toolResponse = {
                        name: tool.name,
                        content: await tool.call(JSON.parse(functionCall.arguments))
                    }
                } catch (e) {
                    toolResponse = {
                        name: tool.name,
                        content: "Call tool `" + functionCall.name + "` failed: " + e
                    }
                }

                loopChatHistory.push(new FunctionChatMessage(
                    toolResponse.content,
                    toolResponse.name,
                ))

            } else {
                finalResponse = responseMessage.text
                break
            }

            if (loopCount > 10) {
                throw new Error("loop count > 10")
            }

            loopCount++

        }

        await this.historyMemory.saveContext(
            { input: message.text },
            { output: finalResponse }
        )

        const aiMessage = new AIChatMessage(finalResponse);

        return {
            message: aiMessage,
        }


    }
}
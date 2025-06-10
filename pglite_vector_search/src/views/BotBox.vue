<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chatMessage'
import { MessageData } from '@/models/chatMessage'
import ChatForm from '@/components/ChatForm.vue'
import { initMemory } from '@/utils/pglite'
import { getDimension, getCurrentConfig, setOpenAIConfig } from '@/utils/openAI'
//import { generateEmbedding } from '@/utils/openAI'

const chatStore = useChatStore()
const messageList = computed((): Map<number, MessageData> => {
    return chatStore.messageList
})

const initialized = ref(false);

// baseURL, chatModel, embeddingModelの編集用（localStorage対応）
function loadConfigFromStorage() {
    const saved = localStorage.getItem('openai_config')
    if (saved) {
        try {
            return JSON.parse(saved)
        } catch { /* ignore */ }
    }
    return getCurrentConfig()
}
const config = ref(loadConfigFromStorage())

watch(config, (val) => {
    localStorage.setItem('openai_config', JSON.stringify(val))
}, { deep: true })

function updateConfig() {
    setOpenAIConfig({
        baseURL: config.value.baseURL,
        chatModel: config.value.chatModel,
        embeddingModel: config.value.embeddingModel
    })
    localStorage.setItem('openai_config', JSON.stringify(config.value))
    window.alert('設定を更新しました')
    window.location.reload()
}

// openAI.tsのデフォルト値を取得するための定数
const defaultConfig = getCurrentConfig();

function resetConfig() {
    config.value = { ...defaultConfig };
    setOpenAIConfig(defaultConfig);
    localStorage.setItem('openai_config', JSON.stringify(defaultConfig));
    window.alert('デフォルト設定に戻しました');
    window.location.reload();
}

// 初期化処理
onMounted(() => {
    // 設定を反映
    setOpenAIConfig({
        baseURL: config.value.baseURL,
        chatModel: config.value.chatModel,
        embeddingModel: config.value.embeddingModel
    })
    // embeddingModelの次元数を取得
    getDimension().then((dimension) => {
        console.log('Embedding dimension:', dimension);
        // PGliteの初期化
        initMemory(dimension).then(() => {
            console.log('Memory initialized successfully.');
            initialized.value = true;
        }).catch((error) => {
            console.error('Error initializing memory:', error);
            window.alert('Memory initialization failed. Please check the console for details.');
        });
    }).catch((error) => {
        console.error('Error getting embedding dimension:', error);
        window.alert('Embedding model initialization failed. Please check the console for details.');
    });
})

// メッセージのフォーマット関数
function formatMessage(msg: string): string {
    return msg.replace(/\n/g, '<br>');
}
</script>

<template>
    <div class="container">
        <!-- 設定編集UIを追加 -->
        <div style="margin-bottom: 16px;">
            <label for="baseURL-input">ollama baseURL:</label>
            <input id="baseURL-input" v-model="config.baseURL" style="width: 300px; margin-right: 8px;" />
            <label for="chatModel-input">chatModel:</label>
            <input id="chatModel-input" v-model="config.chatModel" style="width: 150px; margin-right: 8px;" />
            <label for="embeddingModel-input">embeddingModel:</label>
            <input id="embeddingModel-input" v-model="config.embeddingModel" style="width: 250px; margin-right: 8px;" />
            <button @click="updateConfig">反映</button>
            <button @click="resetConfig" style="margin-right: 8px;">デフォルトに戻す</button>
        </div>
        <template v-for="[id, message] in messageList" v-bind:key="id">
            <div v-if="message.isBot" class="bot-message" v-html="formatMessage(message.message)"></div>
            <div v-else class="user-message">{{ message.message }}</div>
        </template>
        <ChatForm v-if="initialized"/>
    </div>
</template>

<style scoped>
.user-message {
    max-width: 80%;
    width: auto;
    margin: 10px;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    align-self: flex-end;
    background-color: #2d81d8;
    color: white;
}

.bot-message {
    max-width: 80%;
    width: auto;
    margin: 10px;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    align-self: flex-start;
    background-color: #f2f2f2;
}

.container {
    flex: 1;
    padding: 20px;
    padding-bottom: 70px !important;
    display: flex;
    flex-direction: column;
}
</style>
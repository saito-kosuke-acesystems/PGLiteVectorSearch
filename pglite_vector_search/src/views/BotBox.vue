<script setup lang="ts">
import '@/assets/main.css'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
const containerRef = ref<HTMLElement | null>(null);

const scrollToBottom = () => {
    if (containerRef.value) {
        const messagesContainer = containerRef.value.querySelector('.messages-container');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}

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

// サイドバーの開閉状態
const sidebarOpen = ref(true)
function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
}

watch(config, (val) => {
    localStorage.setItem('openai_config', JSON.stringify(val))
}, { deep: true })

function updateConfig() {
    setOpenAIConfig({
        baseURL: config.value.baseURL,
        chatModel: config.value.chatModel,
        embeddingModel: config.value.embeddingModel,
        useOllamaAPI: config.value.useOllamaAPI
    })
    localStorage.setItem('openai_config', JSON.stringify(config.value))
    window.alert('設定を更新しました')
    window.location.reload()
}

// openAI.tsのデフォルト値を取得するための定数
const defaultConfig = getCurrentConfig();

function resetConfig() {
    config.value = { ...defaultConfig };
    setOpenAIConfig({
        ...defaultConfig,
        useOllamaAPI: defaultConfig.useOllamaAPI
    });
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
        embeddingModel: config.value.embeddingModel,
        useOllamaAPI: config.value.useOllamaAPI
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

// メッセージリストの変更を監視して自動スクロール
watch(messageList, () => {
    // DOMの更新後にスクロールを実行するため、nextTickを使用
    nextTick(() => {
        scrollToBottom();
    });
}, { deep: true });

// メッセージのフォーマット関数
function formatMessage(msg: string): string {
    return msg.replace(/\n/g, '<br>');
}
</script>

<template>
    <div class="container">
        <!-- サイドバー（設定UI） -->
        <div class="sidebar" :class="{ closed: !sidebarOpen }">
            <button class="sidebar-toggle" @click="toggleSidebar">
                <span v-if="sidebarOpen">＜</span>
                <span v-else>≡</span>
            </button> <template v-if="sidebarOpen">
                <label for="baseURL-input" class="sidebar-label">ollama baseURL:</label>
                <input id="baseURL-input" v-model="config.baseURL" class="sidebar-input" />
                <label for="chatModel-input" class="sidebar-label">chatModel:</label>
                <input id="chatModel-input" v-model="config.chatModel" class="sidebar-input" />
                <label for="embeddingModel-input" class="sidebar-label">embeddingModel:</label>
                <input id="embeddingModel-input" v-model="config.embeddingModel" class="sidebar-input" />
                <div style="margin-top: 8px;">
                    <label for="useOllamaAPI-checkbox" class="sidebar-label">
                        <input id="useOllamaAPI-checkbox" v-model="config.useOllamaAPI" type="checkbox"
                            style="margin-right: 8px;" />
                        OllamaAPI使用
                    </label>
                </div>
                <div style="margin-top: 8px; display: flex; justify-content: space-between;">
                    <button @click="resetConfig" class="config-btn reset-btn" title="デフォルト設定に戻します">リセット</button>
                    <button @click="updateConfig" class="config-btn" title="設定を適用します">適用</button>
                </div>
            </template>
        </div>
        <!-- メインコンテンツ（チャット） -->
        <div class="main-content" ref="containerRef">
            <div class="messages-container">
                <template v-for="[id, message] in messageList" v-bind:key="id">
                    <div class="message-wrapper" :class="{ user: !message.isBot }">
                        <div v-if="message.isBot" class="bot-message" v-html="formatMessage(message.message)"></div>
                        <div v-else class="user-message">{{ message.message }}</div>
                    </div>
                </template>
            </div>
            <!-- チャットフォーム（画面下部） -->
            <div class="chat-form-bottom" v-if="initialized">
                <ChatForm />
            </div>
        </div>
    </div>
</template>

<style></style>